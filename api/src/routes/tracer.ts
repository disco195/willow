import cp from 'child_process'
import express from 'express'
import * as schema from '../schema/schema'
import { Action, User, Config } from '../data'

/**
 * Create the handlers for spawning tracer processes and executing traces.
 */
export const router = (config: Config, onAction: (user: User, action: Action) => void) => {
    const router = express.Router()
    const tracerLanguages = Object.keys(config.tracers)

    router.get('/languages', (req, res) => {
        console.log('http', req.path, tracerLanguages)
        res.send(tracerLanguages)
    })

    router.post('/trace', async (req, res) => {
        const user = req.user as User
        const language = req.body['language'] as string
        const steps = user ? config.authSteps : config.steps
        const timeout = user ? config.authTimeout : config.timeout
        const trace = { source: req.body['source'] as string, input: req.body['input'] as string, steps }
        console.log('http', req.path, user, language, steps, timeout)
        try {
            if (!config.tracers[language]) throw new Error(`Language ${language} is not available`)
            const result = await runTracer(config.tracers[language], trace, timeout)
            onAction(user, { date: new Date(), name: 'trace', payload: { trace, result } })
            res.status(200).send(result)
            console.log('http', req.path, 'ok')
        } catch (error) {
            onAction(user, { date: new Date(), name: 'trace fail', payload: { trace, error: error.message } })
            res.status(400).send(error.message)
            console.log('http', req.path, 'error', error.message)
        }
    })

    return router
}

/**
 * Spawn tracer process using the received shell command, send the trace request to it and wait the trace result.
 * If the tracer finishes before timeout, returns the result.
 * If the tracer writes any error in the error stream, throws the error content.
 * If the tracer does not finish before the timeout, throws a reached timeout.
 * This function might also fail if the trace result is not JSON parsable.
 *
 * @param command any shell command that accepts the trace request as a JSON serialized string through standard input
 *                stream, outputs the result to the standard output stream and errors to the standard error stream
 * @param trace the trace object
 * @param timeout the maximum execution time in milliseconds
 */
export const runTracer = async (command: string, trace: schema.Trace, timeout: number) => {
    const tracer = cp.spawn(command, { shell: true })

    const stopPromise = new Promise((resolve, reject) => {
        tracer.on('close', (code, signal) => resolve())
        setTimeout(() => reject(new Error(`Trace took longer than ${timeout}ms to execute`)), timeout)
    })

    const stdoutBuffers: Buffer[] = []
    const stderrBuffers: Buffer[] = []
    tracer.stdout.on('data', chunk => stdoutBuffers.push(chunk))
    tracer.stderr.on('data', chunk => stderrBuffers.push(chunk))
    tracer.stdin.end(JSON.stringify(trace, undefined, 0))

    try {
        await stopPromise
    } finally {
        tracer.kill()
    }
    if (stderrBuffers.length > 0) throw new Error(Buffer.concat(stderrBuffers).toString('utf-8'))
    return JSON.parse(Buffer.concat(stdoutBuffers).toString('utf-8')) as schema.Result
}
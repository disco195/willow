import cp from 'child_process'
import express from 'express'
import * as schema from './schema/schema'

/**
 * Create the handlers for spawning tracer processes and executing traces.
 *
 * @param tracers dictionary with languages and commands to spawn their tracers
 * @param steps maximum number of steps a tracer is allowed to run
 * @param timeout maximum time in milliseconds a tracer is allowed to run
 * @param signedSteps override steps for signed users
 * @param signedTimeout override timeout for signed users
 * @param verbose enable verbose output (prints traces and results)
 */
export const createHandlers = <T>(
    tracers: { [name: string]: string },
    steps: number,
    timeout: number,
    signedSteps?: number,
    signedTimeout?: number,
    verbose: boolean = false
) => {
    const router = express.Router()
    const tracerLanguages = Object.keys(tracers)

    router.get('/languages', (req, res) => {
        console.log('http', req.path, tracerLanguages)
        res.send(tracerLanguages)
    })

    router.post('/trace', async (req, res) => {
        const user = req.user as T
        const language = req.body['language'] as string
        steps = user && signedSteps != undefined ? signedSteps : steps
        timeout = user && signedTimeout != undefined ? signedTimeout : timeout
        const trace = { source: req.body['source'] as string, input: req.body['input'] as string, steps }
        console.log('http', req.path, user, language, steps, timeout, verbose ? trace : '')
        try {
            if (!tracers[language]) throw new Error(`Language ${language} is not available.`)
            const result = await runTracer(tracers[language], trace, timeout)
            res.send(result)
            console.log('http', req.path, 'ok', verbose ? result : '')
        } catch (error) {
            res.status(400)
            res.send(error.message)
            console.log('http', req.path, 'error', error.message)
        }
    })
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
const runTracer = async (command: string, trace: schema.Trace, timeout: number) => {
    const tracer = cp.spawn(command, { shell: true })

    const stopPromise = new Promise((resolve, reject) => {
        tracer.on('close', (code, signal) => resolve())
        setTimeout(() => reject(new Error(`Trace took longer than ${timeout}ms to execute.`)), timeout)
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

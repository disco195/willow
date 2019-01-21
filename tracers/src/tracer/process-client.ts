import * as cp from 'child_process'
import * as rx from 'rxjs'
import * as rxOps from 'rxjs/operators'
import { Writable } from 'stream'

import { isErrorResult, isLastResult, Result } from '../result'
import { Tracer } from './tracer'


/**
 * Connects to a tracer process.
 */
export class ProcessClient implements Tracer {
    private command: string
    private state: 'created' | 'started' | 'stopped'
    private stdin: Writable
    private stdout: AsyncIterableIterator<Result[]>
    private stderr: rx.Observable<string>


    /**
     * Initializes the client with the command to spawn the process.
     */
    constructor(command: string) {
        this.command = command
        this.state = 'created'
    }

    /**
     * Throws an exception if the tracer state is not in the expected states list.
     */
    private requireState(...states: Array<typeof ProcessClient.prototype.state>) {
        if (!states.includes(this.state))
            throw new Error(`unexpected tracer state: ${this.state}, expected one of: ${states}`)
    }

    /**
     * Spawns the tracer server process.
     */
    private spawn() {
        const instance = cp.spawn(this.command, { shell: true })
        this.stdin = instance.stdin
        this.stdout = observableGenerator(
            observableAnyToLines(rx.fromEvent(instance.stdout, 'data'))
                .pipe(
                    rxOps.filter(line => line.startsWith('[')),
                    rxOps.map(line => JSON.parse(line) as Result[]),
                ),
            next => isLastResult(next[next.length - 1])
        )
        this.stderr = observableAnyToLines(rx.fromEvent(instance.stderr, 'data'))
        this.stderr.subscribe(error => console.error(error))
    }

    getState() {
        return this.state
    }

    async start() {
        this.requireState('created')

        this.spawn()
        this.stdin.write('start\n')
        const results = (await this.stdout.next()).value
        this.state = 'started'
        if (isErrorResult(results[results.length - 1])) this.stop()
        return results
    }

    stop() {
        this.requireState('started', 'created')

        try { this.stdin.write(`stop\n`) }
        catch (error) { /* ignored */ }
        this.state = 'stopped'
        this.stdin = this.stdout = this.stderr = null
    }

    input(input: string) {
        this.requireState('started')

        this.stdin.write(`input ${input}\n`)
    }

    async step() {
        this.requireState('started')

        this.stdin.write('step\n')
        const results = (await this.stdout.next()).value
        if (isLastResult(results[results.length - 1]) || isErrorResult(results[results.length - 1])) this.stop()
        return results
    }
}

/**
 * Pipes an rx.Observable<any> containing text split in any form to string lines obtained from the buffers.
 */
function observableAnyToLines(observable: rx.Observable<any>): rx.Observable<string> {
    return observable
        .pipe(
            rxOps.map(object => object as Buffer),
            rxOps.map(buffer => buffer.toString('utf8')),
            rxOps.flatMap(text => rx.from(text.split(/(\n)/))),
            rxOps.filter(part => part.length !== 0),
            rxOps.map(part => [part]),
            rxOps.scan((acc, parts) => acc[acc.length - 1] === '\n' ? parts : [...acc, ...parts], ['\n']),
            rxOps.filter(parts => parts[parts.length - 1] === '\n'),
            rxOps.map(lineParts => lineParts.join('')),
        )
}

/**
 * Creates an async generator for the received observable results.
 */
async function* observableGenerator<T>(observable: rx.Observable<T>, stopPredicate: (element: T) => boolean)
    : AsyncIterableIterator<T> {
    while (true) {
        const next = await new Promise(resolve => {
            const subscription = observable.subscribe(value => {
                subscription.unsubscribe()
                resolve(value)
            })
        }) as T
        if (!next || stopPredicate(next)) return next
        yield next
    }
}

import * as rx from 'rxjs'
import * as rxOps from 'rxjs/operators'
import { ObservableProcess, StreamLine } from '../process/observable-process'
import { isErrorResult, isLastResult, Result } from '../result'
import { Tracer } from './tracer'


/**
 * Connects to a tracer process.
 */
export class TracerProcess implements Tracer {
    private process: ObservableProcess
    private results: rx.Observable<Result[]>
    private state: 'created' | 'started' | 'stopped'

    /**
     * Initializes the client with the command to spawn the process.
     */
    constructor(command: string) {
        this.process = new ObservableProcess(command)
        this.state = 'created'
    }

    /**
     * Throws an exception if the tracer state is not in the expected states list.
     */
    private requireState(...states: typeof TracerProcess.prototype.state[]) {
        if (!states.includes(this.state))
            throw new Error(`unexpected tracer state: ${this.state}, expected one of: ${states}`)
    }

    getState() {
        return this.state
    }

    async start() {
        this.requireState('created')

        this.process.spawn()
        this.results = this.process.stdMux
            .pipe(
                rxOps.map(streamLine => {
                    if (streamLine.stream === 'stderr') throw new Error(`process stderr: ${streamLine.line}`)
                    if (!streamLine.line.startsWith('[')) throw new Error(`process stdout: ${streamLine.line}`)
                    try { return JSON.parse(streamLine.line) as Result[] }
                    catch (error) { throw new SyntaxError(`process stdout: ${error.message}`) }
                })
            )
        await this.results.pipe(rxOps.take(1)).toPromise()

        this.process.stdin.next('start')
        const results = await this.results.pipe(rxOps.take(1)).toPromise()
        this.state = 'started'
        if (isErrorResult(results[results.length - 1])) this.stop()
        return results
    }

    stop() {
        this.requireState('started', 'created')

        try {
            this.process.stdin.next('stop')
            this.process.stdin.complete()
        } catch (error) { /* ignore */ }
        this.state = 'stopped'
    }

    input(input: string) {
        this.requireState('started')

        this.process.stdin.next(`input ${input}`)
    }

    async step() {
        this.requireState('started')

        this.process.stdin.next('step')
        const results = await this.results.pipe(rxOps.take(1)).toPromise()
        if (isLastResult(results[results.length - 1]) || isErrorResult(results[results.length - 1])) this.stop()
        return results
    }
}

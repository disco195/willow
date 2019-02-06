import { Reducer } from 'redux'


export type State = {
    readonly text: string[]
    readonly breakpoints: ReadonlySet<number>
    readonly markers: ReadonlySet<{ line: number, type: 'highlight' | 'warning' | 'error' }>
}
export type Action =
    { type: 'code/setText', payload: { text: string[] } } |
    { type: 'code/setBreakpoint', payload: { line: number } } |
    { type: 'code/setMarkers', payload: { markers: { line: number, type: 'highlight' | 'warning' | 'error' }[] } }

const initialState: State = {
    text: [],
    breakpoints: new Set(),
    markers: new Set()
}

export const reducer: Reducer<State, Action> = (state = initialState, action) => {
    if (!action) return state
    switch (action.type) {
        case 'code/setText': return { ...state, ...action.payload }
        case 'code/setBreakpoint': {
            const breakpoints = new Set(state.breakpoints)
            breakpoints.has(action.payload.line)
                ? breakpoints.delete(action.payload.line)
                : breakpoints.add(action.payload.line)
            return { ...state, breakpoints }
        }
        case 'code/setMarkers': return { ...state, markers: new Set(action.payload.markers) }
    }
    return state
}

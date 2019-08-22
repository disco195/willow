import { Reducer } from 'redux'
import { serverApi } from '../server'
import { AsyncAction } from './Store'

type State = {
    fetching: boolean
    languages: string[]
    language: string
    source: string[]
    input: string[]
    error: string
}

type Action =
    | { type: 'program/fetchLanguages'; payload?: { languages: string[] }; error?: string }
    | { type: 'program/setLanguage'; payload: string }
    | { type: 'program/setSource'; payload: string[] }
    | { type: 'program/setInput'; payload: string[] }

const initialState: State = {
    fetching: false,
    languages: undefined,
    language: undefined,
    source: undefined,
    input: undefined,
    error: undefined
}

export const reducer: Reducer<State, Action> = (state = initialState, action) => {
    switch (action.type) {
        case 'program/fetchLanguages':
            if (action.payload)
                return {
                    ...state,
                    languages: action.payload.languages,
                    language: action.payload.languages[0],
                    fetching: false
                }
            if (action.error) return { ...state, fetching: false, error: action.error }
            return { ...state, fetching: true }
        case 'program/setLanguage':
            return { ...state, language: action.payload }
        case 'program/setSource':
            return { ...state, source: action.payload }
        case 'program/setInput':
            return { ...state, input: action.payload }
    }
    return state
}

export const actions = {
    fetchLanguages: (): AsyncAction => async dispatch => {
        dispatch({ type: 'program/fetchLanguages' })
        try {
            const languages = (await serverApi.get('/languages')).data as string[]
            dispatch({ type: 'program/fetchLanguages', payload: { languages } })
        } catch (error) {
            dispatch({ type: 'program/fetchLanguages', error: error.response ? error.response.data : error.toString() })
        }
    },
    setLanguage: (selected: string): Action => ({ type: 'program/setLanguage', payload: selected }),
    setSource: (source: string[]): Action => ({ type: 'program/setSource', payload: source }),
    setInput: (input: string[]): Action => ({ type: 'program/setInput', payload: input })
}

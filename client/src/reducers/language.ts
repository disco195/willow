import { Reducer } from 'redux'
import { serverApi } from '../server'
import { AsyncAction } from './Store'

type State = {
    fetching: boolean
    languages: string[]
    selected: number
    error: string
}
type Action =
    | { type: 'language/fetch'; payload?: { languages: string[] }; error?: string }
    | { type: 'language/select'; payload: number }

const initialState: State = {
    fetching: false,
    languages: [],
    selected: 0,
    error: undefined
}

export const reducer: Reducer<State, Action> = (state = initialState, action) => {
    switch (action.type) {
        case 'language/fetch':
            if (action.payload) return { ...state, fetching: false, languages: action.payload.languages }
            if (action.error) return { ...state, fetching: false, error: action.error }
            return { ...initialState, fetching: true }
        case 'language/select':
            return { ...state, selected: action.payload }
    }
    return state
}

const fetch = (): AsyncAction => async dispatch => {
    dispatch({ type: 'language/fetch' })
    try {
        const languages = (await serverApi.get('/languages')).data as string[]
        dispatch({ type: 'language/fetch', payload: { languages } })
    } catch (error) {
        dispatch({ type: 'language/fetch', error: error.response ? error.response.data : error.toString() })
    }
}

const select = (selected: number): Action => ({ type: 'language/select', payload: selected })

export const actions = { fetch, select }

import ace from 'brace'
import React from 'react'
import { useSelection } from '../../reducers/Store'
import { TextEditor } from './TextEditor'

export const OutputEditor = () => {
    const editor = React.useRef<ace.Editor>()

    React.useLayoutEffect(() => {
        editor.current.renderer.setShowGutter(false)
    }, [editor.current])

    useSelection(async state => {
        const tracer = state.tracer
        if (!editor.current || !tracer.available) return
        editor.current.session.doc.setValue(state.output[state.tracer.index])
        editor.current.scrollToLine(editor.current.session.getLength(), true, true, undefined)
    })

    return <TextEditor onEditor={React.useCallback(e => (editor.current = e), [])} />
}

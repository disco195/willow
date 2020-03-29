import { css } from 'emotion'
import React from 'react'
import { Draggable } from './Draggable'

const classes = {
    container: 'd-flex w-100 h-100',
    pane: 'd-flex',
    dragger: {
        base: css({
            display: 'flex',
            background: 'padding-box lightgray',
            boxSizing: 'border-box',
            border: '0px solid transparent',
            transition: 'all 0.2s ease',
            zIndex: 5,
            ':hover': { background: 'darkgray', border: '4px solid lightgray' }
        }),
        row: css({ width: '10px', borderLeftWidth: 4, borderRightWidth: 4, marginLeft: -4, marginRight: -4 }),
        column: css({ height: '10px', borderTopWidth: 4, borderBottomWidth: 4, marginTop: -4, marginBottom: -4 })
    }
}

const styles = {
    size: (ratio: number) => `calc(${ratio * 100}% - 2px)`,
    cursor: (layout: 'row' | 'column') => (layout === 'row' ? 'ew-resize' : 'ns-resize')
}

const createSharedState = <T extends any>(initialValue: T) => {
    const get = () => initialValue
    const set = (value: T) => (initialValue = value)
    return { get, set }
}

const resizeIsCapturedContext = React.createContext(createSharedState(false))

export const SplitPane = (props: {
    orientation?: 'row' | 'column'
    ratio?: number
    range?: [number, number]
    children?: [React.ReactNode, React.ReactNode]
}) => {
    const { orientation = 'row', ratio: initialRatio = 0.5, range = [0.2, 0.8], children } = props
    const container$ = React.useRef<HTMLDivElement>()
    const firstPane$ = React.useRef<HTMLDivElement>()
    const secondPane$ = React.useRef<HTMLDivElement>()
    const resizeIsCaptured = React.useContext(resizeIsCapturedContext)
    const ratio = React.useRef(Math.min(Math.max(initialRatio, range[0]), range[1]))
    const freeDimension = orientation === 'row' ? 'width' : 'height'

    React.useLayoutEffect(() => {
        if (resizeIsCaptured.get()) return
        resizeIsCaptured.set(true)
        let eventFired = false
        let eventThrottling = false
        const onResize = () => {
            eventFired = true
            if (eventThrottling) return
            eventThrottling = true
            dispatchEvent(new Event('paneResizeStart'))
            const handler = setInterval(() => {
                dispatchEvent(new Event('paneResize'))
                if (eventFired) return (eventFired = false)
                dispatchEvent(new Event('paneResizeEnd'))
                eventThrottling = false
                clearInterval(handler)
            }, 50)
        }
        addEventListener('resize', onResize)
        return () => removeEventListener('resize', onResize)
    }, [])

    return (
        <div ref={container$} className={classes.container} style={{ flexDirection: orientation }}>
            <div ref={firstPane$} className={classes.pane} style={{ [freeDimension]: styles.size(ratio.current) }}>
                {children[0]}
            </div>
            <Draggable
                props={{
                    className: `${classes.dragger.base} ${classes.dragger[orientation]}`,
                    style: { cursor: styles.cursor(orientation) }
                }}
                onDragStart={() => dispatchEvent(new Event('resize'))}
                onDrag={(_, delta) => {
                    const rect = container$.current.getBoundingClientRect()
                    const change = orientation === 'row' ? delta.x / rect.width : delta.y / rect.height
                    ratio.current = Math.min(Math.max(ratio.current + change, range[0]), range[1])
                    firstPane$.current.style[freeDimension] = styles.size(ratio.current)
                    secondPane$.current.style[freeDimension] = styles.size(1 - ratio.current)
                    dispatchEvent(new Event('resize', { cancelable: true }))
                }}
                onDragEnd={() => dispatchEvent(new Event('resize'))}
            />
            <div ref={secondPane$} className={classes.pane} style={{ [freeDimension]: styles.size(1 - ratio.current) }}>
                {children[1]}
            </div>
        </div>
    )
}

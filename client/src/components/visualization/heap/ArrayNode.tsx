import cn from 'classnames'
import { css } from 'emotion'
import * as React from 'react'
import { colors } from '../../../colors'
import { ObjNode } from '../../../reducers/tracer'
import * as protocol from '../../../schema/schema'
import { SquareBaseNode } from './BaseNode'
import { Link, Node } from './Heap'
import { BooleanParameter, RangeParameter } from './Parameters'

const classes = {
    elements: cn('d-flex align-items-center', 'text-nowrap'),
    element: cn(
        'd-inline-flex flex-column',
        'px-1',
        css({
            border: `0.5px solid ${colors.gray.dark}`,
            cursor: 'default',
            fontSize: '1rem',
            background: colors.blue.light
        })
    ),
    index: cn('text-truncate', css({ fontSize: '0.5rem' })),
    value: cn('text-center text-truncate', css({ fontSize: '0.75rem' }))
}

const getParameters = (node: Node) => {
    const parameters = node.parameters

    return {
        showIndex:
            parameters && typeof parameters['showIndex'] === 'boolean' ? (parameters['showIndex'] as boolean) : true,
        maxWidth: parameters && typeof parameters['maxWidth'] === 'number' ? (parameters['maxWidth'] as number) : 30
    }
}

const supported = new Set(['array', 'alist', 'llist', 'tuple'])
const defaults = new Set(['array', 'alist', 'tuple'])

export const isDefault = (objNode: ObjNode) => defaults.has(objNode.type)

// tslint:disable-next-line: variable-name
export function Node(props: { objNode: ObjNode; node: Node; link: Link }) {
    if (supported.has(props.objNode.type))
        return (
            <SquareBaseNode obj={props.objNode}>
                <div className={classes.elements}>incompatible</div>
            </SquareBaseNode>
        )

    if (props.objNode.members.length === 0)
        return (
            <SquareBaseNode obj={props.objNode}>
                <div className={classes.elements}>empty</div>
            </SquareBaseNode>
        )

    const { showIndex, maxWidth } = getParameters(props.node)

    return (
        <SquareBaseNode obj={props.objNode}>
            <div className={classes.elements}>
                {props.objNode.members.map((member, i) => {
                    const isReference = typeof member.value === 'object'
                    const value = isReference ? '::' : member.value
                    return (
                        <div key={i} className={classes.element} style={{ maxWidth }} title={`${value}`}>
                            {showIndex && <span className={classes.index}>{i}</span>}
                            <span
                                ref={ref => {
                                    if (!isReference) return
                                    props.link.push({ ref, target: (member.value as ObjNode).reference, under: false })
                                }}
                                className={classes.value}
                            >
                                {value}
                            </span>
                        </div>
                    )
                })}
            </div>
        </SquareBaseNode>
    )
}

export function Parameters(props: { obj: ObjNode; node: Node; onChange: () => void }) {
    const parameters = getParameters(props.node)

    return (
        <>
            <BooleanParameter
                name={'show index'}
                value={parameters.showIndex}
                onChange={value => {
                    props.node.parameters.showIndex = value
                    props.onChange()
                }}
            />
            <RangeParameter
                name={'max width'}
                value={parameters.maxWidth}
                interval={{ min: 10, max: 200 }}
                onChange={value => {
                    props.node.parameters.maxWidth = value
                    props.onChange()
                }}
            />
        </>
    )
}

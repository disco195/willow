import cn from 'classnames'
import { css } from 'emotion'
import * as React from 'react'
import { Item, Menu, MenuProvider, Separator, Submenu } from 'react-contexify'
import { colors } from '../../../colors'
import { State } from '../../../reducers/Store'
import { ObjData } from '../../../reducers/tracer'
import { clamp, Draggable, lerp, svgScreenPointTransform, svgScreenVectorTransform } from './Utils'
import * as ArrayModule from './Array'
import * as BarsModule from './Bars'
import * as FieldModule from './Field'
import { HeapControl, UnknownParameters } from './Heap'
import * as MapModule from './Map'

import 'react-contexify/dist/ReactContexify.min.css'

const modules = {
    array: { ...ArrayModule },
    bars: { ...BarsModule },
    field: { ...FieldModule },
    map: { ...MapModule }
}

const classes = {
    container: cn(css({ cursor: 'move', transition: 'x 0.2s ease-out, y 0.2s ease-out' })),
    draggable: cn('d-flex position-absolute', css({ userSelect: 'none' })),
    menuProvider: cn('d-flex'),
    selected: cn(css({ background: colors.blue.lighter })),
    path: cn(css({ stroke: colors.gray.dark, strokeWidth: 2, fill: 'none' })),
    polyline: cn(css({ stroke: colors.gray.dark, strokeWidth: 2, fill: 'none' }))
}

export const Wrapper = (props: {
    objData: ObjData
    tracer: State['tracer']
    heapControl: HeapControl
    updateHeap: React.Dispatch<{}>
}) => {
    const ref = React.useRef<SVGForeignObjectElement>()
    const childRef = React.useRef<HTMLDivElement>()
    const targetRefs = React.useRef<{ target: string; element: HTMLElement }[]>([])
    const pathRefs = React.useRef<SVGPathElement[]>([])
    const updateThis = React.useState({})[1]
    const { id, type, languageType } = props.objData
    const { index } = props.tracer
    const parameterSelector = props.heapControl.getParameterSelector(id, 'type')
    const idParameters = props.heapControl.getIdParameters(id, {})
    const typeParameters = props.heapControl.getTypeParameters(languageType, {})
    const defaultNodeNames = Object.entries(modules)
        .filter(([, mod]) => mod.defaults.has(type))
        .map(([name]) => name)
    const supportedNodeNames = Object.entries(modules)
        .filter(([, mod]) => mod.supported.has(type))
        .map(([name]) => name)
    const nodeName = (parameterSelector === 'id'
        ? props.heapControl.getIdNodeName(id, defaultNodeNames[0])
        : props.heapControl.getTypeNodeName(languageType, defaultNodeNames[0])) as keyof typeof modules
    console.log(modules, nodeName)
    const { Node, NodeParameters } = modules[nodeName]
    targetRefs.current = []
    pathRefs.current = []

    const getLinkedObjDataIds = (id: string, pool: Set<string>, depth: number) => {
        if (depth < 0 || pool.has(id)) return
        pool.add(id)
        props.heapControl.getTargets(id).forEach(({ target }) => getLinkedObjDataIds(target, pool, depth - 1))
        return pool
    }

    const moveWrappers = (delta: { x: number; y: number }, depth: number, update: 'all' | 'from' | 'single') => {
        const linkedPool = getLinkedObjDataIds(id, new Set(), depth)
        linkedPool.forEach(id => {
            const position = props.heapControl.getPosition(id, index)
            const updateRange = [
                update === 'all' ? 0 : index,
                update === 'single' ? index : props.tracer.heapsData.length
            ] as [number, number]
            props.heapControl.setPositionRange(id, updateRange, {
                x: position.x + delta.x,
                y: position.y + delta.y
            })
            props.heapControl.callSubscriptions(id)
        })
    }

    const computePathCoordinates = (
        sourcePosition: { x: number; y: number },
        delta: { x: number; y: number },
        targetPosition: { x: number; y: number },
        targetSize: { x: number; y: number }
    ) => {
        const source = { x: sourcePosition.x + delta.x, y: sourcePosition.y + delta.y }
        const target = {
            x: clamp(source.x, targetPosition.x, targetPosition.x + targetSize.x),
            y: clamp(source.y, targetPosition.y, targetPosition.y + targetSize.y)
        }
        const center = { x: lerp(0.5, source.x, target.x), y: lerp(0.5, source.y, target.y) }
        const parallelVector = { x: target.x - source.x, y: target.y - source.y }
        const orthogonalVector = { x: parallelVector.y / 4, y: -parallelVector.x / 4 }
        const control = { x: center.x + orthogonalVector.x, y: center.y + orthogonalVector.y }
        return `M ${source.x},${source.y} Q ${control.x},${control.y} ${target.x},${target.y}`
    }

    const repositionWrappers = (update: 'all' | 'from' | 'single') => {
        const groupMap = props.tracer.groupMapsData[index]
        const group = groupMap[id]
        if (!group || group.type === 'unknown') return
        const base = group.base
        const positionAnchor = props.heapControl.getPosition(id, index)
        const sizeAnchor = props.heapControl.getSize(id, index)
        const increment = { x: sizeAnchor.x * 1.8, y: sizeAnchor.y * 1.1 }
        const updateRange = [
            update === 'all' ? 0 : index,
            update === 'single' ? index : props.tracer.heapsData.length
        ] as [number, number]

        const postOrderSetPosition = (objData: ObjData, depth: { x: number; y: number }, repositioned: Set<string>) => {
            if (repositioned.has(objData.id)) return
            repositioned.add(objData.id)
            const initialYDepth = depth.y
            const childObjects = objData.members.filter(
                member => typeof member.value === 'object' && member.value.languageType === objData.languageType
            )
            const isLeaf = childObjects.length === 0
            if (!isLeaf) {
                depth.x++
                childObjects.forEach(member => postOrderSetPosition(member.value as ObjData, depth, repositioned))
                depth.x--
            }

            props.heapControl.setPositionRange(objData.id, updateRange, {
                x: positionAnchor.x + increment.x * depth.x,
                y:
                    positionAnchor.y +
                    increment.y * (isLeaf ? depth.y++ : initialYDepth + (depth.y - 1 - initialYDepth) / 2)
            })
        }
        const repositioned = new Set<string>()
        postOrderSetPosition(props.tracer.heapsData[index][base], { x: 0, y: 0 }, repositioned)

        const basePosition = props.heapControl.getPosition(base, index)
        const baseAnchorDelta = { x: positionAnchor.x - basePosition.x, y: positionAnchor.y - basePosition.y }
        repositioned.forEach(id => {
            const position = props.heapControl.getPosition(id, index)
            props.heapControl.setPositionRange(id, updateRange, {
                x: position.x + baseAnchorDelta.x,
                y: position.y + baseAnchorDelta.y
            })
        })

        repositioned.forEach(id => props.heapControl.callSubscriptions(id))
    }

    React.useLayoutEffect(() => {
        const childRect = childRef.current.getBoundingClientRect()
        const childScreenSize = { x: childRect.width, y: childRect.height }
        const [childSvgSize] = svgScreenVectorTransform('toSvg', ref.current, childScreenSize)
        ref.current.setAttribute('width', childSvgSize.x.toString())
        ref.current.setAttribute('height', childSvgSize.y.toString())
        props.heapControl.setSizeRange(id, [index, index], childSvgSize)
        props.heapControl.callSubscriptions(id)
    })

    React.useLayoutEffect(() => {
        let previousSubscriptionIndex = undefined as number
        const updatePosition = (subscriptionIndex?: number) => {
            if (previousSubscriptionIndex !== undefined && previousSubscriptionIndex === subscriptionIndex) return
            previousSubscriptionIndex = subscriptionIndex
            const position = props.heapControl.getPosition(id, index, { x: 0, y: 0 })
            ref.current.setAttribute('x', position.x.toString())
            ref.current.setAttribute('y', position.y.toString())
        }
        updatePosition()
        props.heapControl.subscribe(id, updatePosition)
    })

    React.useLayoutEffect(() => {
        const childRect = childRef.current.getBoundingClientRect()
        const targets = targetRefs.current.map(({ target, element }) => {
            const elementRect = element.getBoundingClientRect()
            const screenDelta = { x: elementRect.left - childRect.left, y: elementRect.top - childRect.top }
            const screenSize = { x: elementRect.width, y: elementRect.height }
            const [svgDelta, svgSize] = svgScreenVectorTransform('toSvg', ref.current, screenDelta, screenSize)
            const delta = { x: svgDelta.x + svgSize.x / 2, y: svgDelta.y + svgSize.y / 2 }
            return { target, delta }
        })
        props.heapControl.setTargets(id, targets)
        props.heapControl.callSubscriptions(id)
    })

    React.useEffect(() => {
        let previousSubscriptionIndex = undefined as number
        const updatePaths = (subscriptionIndex?: number) => {
            if (previousSubscriptionIndex !== undefined && previousSubscriptionIndex === subscriptionIndex) return
            previousSubscriptionIndex = subscriptionIndex
            const targets = props.heapControl.getTargets(id)
            pathRefs.current.forEach(pathRef => pathRef.setAttribute('visibility', 'hidden'))
            targets.forEach(({ target, delta }, i) => {
                const sourcePosition = props.heapControl.getPosition(id, index)
                const targetPosition = props.heapControl.getPosition(target, index)
                const targetSize = props.heapControl.getSize(target, index)
                const pathCoordinates = computePathCoordinates(sourcePosition, delta, targetPosition, targetSize)
                const pathRef = pathRefs.current[i]
                pathRef.setAttribute('visibility', 'visible')
                pathRef.setAttribute('d', pathCoordinates)
            })
        }
        updatePaths()
        props.heapControl.subscribe(id, updatePaths)
        props.heapControl.getTargets(id).forEach(({ target }) => props.heapControl.subscribe(target, updatePaths))
    })

    return (
        <>
            <foreignObject ref={ref} className={classes.container}>
                <Draggable
                    containerProps={{ ref: childRef, className: classes.draggable }}
                    onDrag={(delta, event) => {
                        const [svgDelta] = svgScreenVectorTransform('toSvg', ref.current, delta)
                        const depth = !event.altKey ? 0 : Infinity
                        const update = !event.ctrlKey ? 'from' : !event.altKey ? 'all' : 'single'
                        moveWrappers(svgDelta, depth, update)
                    }}
                >
                    <MenuProvider id={id} className={classes.menuProvider}>
                        <div
                            className={classes.menuProvider}
                            onDoubleClick={event => {
                                const update = !event.ctrlKey ? 'from' : !event.altKey ? 'all' : 'single'
                                repositionWrappers(update)
                            }}
                        >
                            <Node
                                objData={props.objData}
                                parameters={parameterSelector === 'id' ? idParameters : typeParameters}
                                onTargetRef={(id, target, ref) => targetRefs.current.push({ target, element: ref })}
                            />
                        </div>
                    </MenuProvider>
                </Draggable>
                <Menu id={id}>
                    <Item
                        onClick={args => (
                            props.heapControl.setParameterSelector(id, parameterSelector === 'id' ? 'type' : 'id'),
                            updateThis({})
                        )}
                    >
                        {`using ${parameterSelector} parameters`}
                    </Item>
                    <Separator />
                    <Submenu label='node'>
                        <Item onClick={args => (props.heapControl.setIdNodeName(id, undefined), updateThis({}))}>
                            reset
                        </Item>
                        {supportedNodeNames.map((nodeName, i) => (
                            <Item
                                key={i}
                                onClick={args =>
                                    parameterSelector === 'id'
                                        ? (props.heapControl.setIdNodeName(id, nodeName), updateThis({}))
                                        : (props.heapControl.setTypeNodeName(languageType, nodeName),
                                          props.updateHeap({}))
                                }
                            >
                                {nodeName}
                            </Item>
                        ))}
                    </Submenu>
                    <Separator />
                    <Submenu label='parameters'>
                        <NodeParameters
                            objData={props.objData}
                            withReset
                            parameters={parameterSelector === 'id' ? idParameters : typeParameters}
                            onChange={(updatedParameters: UnknownParameters) =>
                                parameterSelector === 'id'
                                    ? (props.heapControl.setIdParameters(id, updatedParameters), updateThis({}))
                                    : (props.heapControl.setTypeParameters(languageType, updatedParameters),
                                      props.updateHeap({}))
                            }
                        />
                    </Submenu>
                </Menu>
            </foreignObject>
            <defs>
                <marker
                    id='pointer'
                    markerWidth={10}
                    markerHeight={8}
                    refX={8}
                    refY={4}
                    orient='auto'
                    markerUnits='userSpaceOnUse'
                >
                    <polyline className={classes.polyline} points='0 0, 10 4, 0 8' />
                </marker>
            </defs>
            {[...Array(props.objData.objMembers)].map((_, i) => (
                <path
                    key={i}
                    ref={ref => ref && pathRefs.current.push(ref)}
                    className={classes.path}
                    markerEnd='url(#pointer)'
                />
            ))}
        </>
    )
}
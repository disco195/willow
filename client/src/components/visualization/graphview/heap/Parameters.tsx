import React from 'react'
import { Item } from 'react-contexify'
import * as tracer from '../../../../types/tracer'
import { DefaultParameters, UnknownParameters } from '../Graph'
import { getValueString, isValueReference } from '../TracerUtils'

const FlagParameter = (props: { name: string; value: boolean; onChange: (value: boolean) => void }) => (
    <Item>
        <span>{props.name}</span>
        <input type='checkbox' checked={props.value} onChange={event => props.onChange(event.target.checked)} />
    </Item>
)

const RangeParameter = (props: {
    name: string
    value: number
    range: [number, number]
    tick: number
    onChange: (value: number) => void
}) => (
    <Item>
        <span>{props.name}</span>
        <input
            type='range'
            value={props.value}
            min={props.range[0]}
            max={props.range[1]}
            step={props.tick}
            onChange={event => props.onChange(event.target.valueAsNumber)}
        />
    </Item>
)

const EnumParameter = (props: {
    name: string
    value: string
    options: string[]
    onChange: (value: string) => void
}) => (
    <Item>
        <span>{props.name}</span>
        <select value={props.value} onChange={event => props.onChange(event.target.value)}>
            {props.options.map(option => (
                <option key={option} value={option}>
                    {option}
                </option>
            ))}
        </select>
    </Item>
)

const MemberParameter = (props: {
    name: string
    value: string | undefined
    members: 'all' | 'values' | 'references'
    obj: tracer.Obj
    onChange: (value: string) => void
}) => {
    const memberNames = props.obj.members
        .filter(
            member =>
                !isValueReference(member.key) &&
                (props.members === 'all' ||
                    (props.members === 'values' && !isValueReference(member.value)) ||
                    (props.members === 'references' && isValueReference(member.value)))
        )
        .map(member => getValueString(member.key))

    return (
        <Item>
            <span>{props.name}</span>
            <select value={props.value} onChange={event => props.onChange(event.target.value)}>
                {props.value == undefined && <option value={undefined}>{'not selected'}</option>}
                {memberNames.map(member => (
                    <option key={member} value={member}>
                        {member}
                    </option>
                ))}
            </select>
        </Item>
    )
}

export const Parameters = (props: {
    resetMessage: string
    parameters: UnknownParameters
    defaults: DefaultParameters
    obj: tracer.Obj
    onChange: (parameters: UnknownParameters) => void
}) => (
    <>
        <Item onClick={() => props.onChange({})}>{props.resetMessage}</Item>
        {Object.entries(props.defaults).map(([name, def]) =>
            (def as any).bool ? (
                <FlagParameter
                    key={name}
                    name={name}
                    value={props.parameters[name] as boolean}
                    onChange={value => props.onChange({ ...props.parameters, [name]: value })}
                />
            ) : (def as any).range ? (
                <RangeParameter
                    key={name}
                    name={name}
                    value={props.parameters[name] as number}
                    range={(def as any).range}
                    tick={(def as any).tick}
                    onChange={value => props.onChange({ ...props.parameters, [name]: value })}
                />
            ) : (def as any).options ? (
                <EnumParameter
                    key={name}
                    name={name}
                    value={props.parameters[name] as string}
                    options={(def as any).options}
                    onChange={value => props.onChange({ ...props.parameters, [name]: value })}
                />
            ) : (def as any).members != undefined ? (
                <MemberParameter
                    key={name}
                    name={name}
                    value={props.parameters[name] as string | undefined}
                    members={(def as any).members}
                    obj={props.obj}
                    onChange={value => props.onChange({ ...props.parameters, [name]: value })}
                />
            ) : (
                <span>{'parameter type error'}</span>
            )
        )}
    </>
)

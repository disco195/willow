import cn from 'classnames'
import { css } from 'emotion'
import React from 'react'
import { colors } from '../colors'
import { DefaultStore } from '../reducers/Store'
import { actions as tracerActions } from '../reducers/tracer'
import logo from '../../public/logo.svg'
import { Controls } from './controls/Controls'
import { InputEditor } from './editor/InputEditor'
import { OutputEditor } from './editor/OutputEditor'
import { SourceEditor } from './editor/SourceEditor'
import { Splitter } from './Splitter'
import { StackTrace } from './visualization/stacktrace/StackTrace'
import { GraphView } from './visualization/graphview/GraphView'

const classes = {
    container: 'd-flex flex-column vw-100 vh-100',
    header: {
        nav: cn('navbar shadow-sm', css({ background: colors.gray.light })),
        link: 'd-flex align-items-center navbar-brand',
        logo: cn('mr-2', css({ width: '2rem', filter: 'invert(1)' })),
        text: css({ color: colors.black, fontSize: '1.5rem' })
    },
    body: {
        container: 'd-flex flex-column flex-fill',
        panel: 'd-flex flex-fill'
    },
    visualization: 'd-flex w-100 h-100'
}

export const App = () => (
    <DefaultStore>
        <div className={classes.container}>
            <Header />
            <Body />
        </div>
    </DefaultStore>
)

const Header = () => (
    <nav className={classes.header.nav}>
        <a className={classes.header.link} href='#'>
            <img src={logo} className={classes.header.logo} />
            <span className={classes.header.text}>Willow</span>
        </a>
    </nav>
)

const Body = () => (
    <div className={classes.body.container}>
        <Controls />
        <div className={classes.body.panel}>
            <Splitter base={0.3}>
                <Editors />
                <Visualization />
            </Splitter>
        </div>
    </div>
)

const Editors = () => (
    <Splitter layout='column'>
        <SourceEditor />
        <Splitter layout='column'>
            <InputEditor />
            <OutputEditor />
        </Splitter>
    </Splitter>
)

export const Visualization = () => (
    <div
        className={classes.visualization}
        onKeyDown={event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            tracerActions.stepIndex(
                event.key === 'ArrowLeft' ? 'backward' : 'forward',
                !event.ctrlKey ? 'into' : !event.altKey ? 'over' : 'out'
            )
        }}
        tabIndex={0}
    >
        <Splitter layout='column' base={0.3}>
            <StackTrace />
            <GraphView />
        </Splitter>
    </div>
)

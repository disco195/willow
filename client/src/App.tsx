import cn from 'classnames'
import { css } from 'emotion'
import * as React from 'react'
import logo from '../public/logo.svg'
import { Editor } from './components/Editor'


export function App() {
    return <div className={cn('d-flex flex-column', css({ width: '100vw', height: '100vh' }))}>
        <div className='d-flex flex-row'>
            <div className='d-block flex-fill'>
                <Header />
            </div>
        </div>
        <div className='d-flex flex-row flex-fill'>
            <div className='d-flex flex-column flex-fill p-3'>
                <Body />
            </div>
        </div>
    </div>
}

function Header() {
    return <nav className='navbar navbar-expand static-top navbar-dark bg-dark shadow-lg'>
        <a className='navbar-brand' href='#'>
            <img src={logo} width={30} height={30} />
            <span className='ml-2'>Willow</span>
        </a>
    </nav>

}

function Body() {
    return <>
        <div className='d-flex flex-row flex-fill'>
            <div className='d-flex flex-column flex-fill mr-2 border rounded shadow'>
                <div className='d-flex flex-row flex-fill'>
                    <Editor />
                </div>
                <div className='d-flex flex-row border' />
                <div className='d-flex flex-row flex-fill'>
                    stdio
                </div>
            </div>
            <div className='d-flex flex-column flex-fill ml-2 border rounded shadow'>
                graph
            </div>
        </div>
    </>
}

# js-rpc2 Library Introduction

`js-rpc2` is a lightweight Remote Procedure Call (RPC) library designed to simplify communication between clients and servers. The library supports various data types, including strings, binary data, objects, arrays, and more, and provides a powerful callback mechanism to provide real-time progress updates during asynchronous operations.

## Main Features

- **Easy to Use**: Simple API design makes it easy to integrate both the client and server sides.
- **Support for Multiple Data Types**: Supports strings, binary data, objects, arrays, and more.
- **Callback Mechanism**: Real-time progress updates can be provided through callback functions during asynchronous operations.
- **Flexible Routing Configuration**: Supports the Koa framework, allowing you to easily integrate RPC routes into existing Koa applications.
- **Cross-Origin Support**: Clients can communicate with servers on different domains via HTTP requests.

## Installation

```sh
npm i js-rpc2
```

## Usage Example

### Server Side

```js
import { createServer } from 'http'
import Koa from 'koa'
import Router from 'koa-router'
import { createRpcServerKoaRouter } from 'js-rpc2/src/server.js'

const app = new Koa()
const router = new Router()
app.use(router.routes())
app.use(router.allowedMethods())
createServer(app.callback()).listen(9000)

class RpcApi {
    /**
     * @param {string} string 
     * @param {Uint8Array} buffer 
     * @param {Object} object 
     * @param {null} _null 
     * @param {undefined} _undefined 
     * @param {object[]} array 
     * @param {(arg1:string,arg2:number)=>void} callback 
     */
    async hello(string, buffer, object, _null, _undefined, array, callback) {
        for (let i = 0; i < 3; i++) {
            callback('progress : ', i)
            await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        return [
            `${typeof string}-${typeof buffer}-${typeof object}-${typeof _null}-${typeof _undefined}-${typeof array}`,
            new Uint8Array(3),
            { a: 1, b: 2, c: 3 },
            1,
            true,
            undefined,
            [1, 2, 3, 4],
        ]
    }
}

const extension = new RpcApi()

createRpcServerKoaRouter({
    path: '/rpc/abc',
    router: router,
    extension: extension,
})
```

### Client Side

```js
import { createRpcClientHttp } from 'js-rpc2/src/client.js'

/** @type{RpcApi} */
const rpc = createRpcClientHttp({
    url: `/rpc/abc`,                      // in same site html page
    url: `http://127.0.0.1:9000/rpc/abc`, // others
})

let ret = await rpc.hello('123', new Uint8Array(3), { q: 2, w: 3, e: 4 }, null, undefined, [1, 2, 3, 4], (message, num) => {
    console.info('callback', message, num)
})
console.info(ret)
```

## Output Example

```sh
node --test-name-pattern="^basic$" src/lib.test.js
✔ basic (4.5986ms)
callback progress :  0
callback progress :  1
callback progress :  2
[
  'string-object-object-object-undefined-object',
  Uint8Array(3) [ 0, 0, 0 ],
  { a: 1, b: 2, c: 3 },
  1,
  true,
  undefined,
  [ 1, 2, 3, 4 ]
]
```

We hope that `js-rpc2` will help you build and manage communication between clients and servers more efficiently.

## example
```js
import { test } from 'node:test'
import { deepStrictEqual, strictEqual } from 'node:assert'
import { createRpcClientHttp, createRpcClientWebSocket, sleep, Uint8Array_from } from './lib.js'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import Koa from 'koa'
import Router from 'koa-router'
import { createRpcServerKoaRouter, createRpcServerWebSocket } from './server.js'

test('测试RPC调用-WebSocket', async () => {
    // node --test-name-pattern="^测试RPC调用-WebSocket$" src/lib.test.js

    const extension = {
        hello: async function (/** @type {string} */ name) {
            return `hello ${name}`
        },
        callback: async function (/** @type {string} */ name, /** @type {(data: string) => void} */ update) {
            for (let i = 0; i < 3; i++) {
                update(`progress ${i}`)
                await sleep(30)
            }
            return `hello callback ${name}`
        },
        callback2: async function (/** @type {string} */ name, /** @type {(data: string, data2:Uint8Array) => void} */ update) {
            for (let i = 0; i < 3; i++) {
                update(`progress ${i}`, Uint8Array_from('2345'))
                await sleep(30)
            }
            return `hello callback ${name}`
        },
        buffer: async function (/** @type {Uint8Array} */ buffer) {
            return buffer.slice(3, 8)
        },
        buffer2: async function (/**@type{string}*/string,/** @type {Uint8Array} */ buffer) {
            return ['message:' + string, buffer.slice(3, 8)]
        },
        bigbuffer: async function (/** @type {Uint8Array} */ buffer) {
            return buffer.slice(3)
        },
        array: async function (/** @type {string} */ name,/** @type {Uint8Array} */ buffer) {
            return [123, 'abc', 'hi ' + name, buffer.slice(3, 8)]
        },
        void: async function (/** @type {string} */ name,/** @type {Uint8Array} */ buffer) {
            console.info('call void')
        }
    }

    await runWithAbortController(async (ac) => {
        let server = createServer()
        ac.signal.addEventListener('abort', () => { server.close() })
        let wss = new WebSocketServer({ server })
        createRpcServerWebSocket({
            path: '/3f1d664e469aa24b54d6bad0d6d869c0',
            wss: wss,
            rpcKey: '11474f3dfbb861700cb6c3864b328311',
            extension: extension,
        })
        server.listen(9000)
        await sleep(100)

        /** @type{typeof extension} */
        let client = createRpcClientWebSocket({
            url: `ws://127.0.0.1:9000/3f1d664e469aa24b54d6bad0d6d869c0`,
            rpcKey: '11474f3dfbb861700cb6c3864b328311',
            signal: ac.signal,
        })
        await sleep(100)

        let string = await client.hello('asdfghjkl')
        console.info(string)
        strictEqual(string, 'hello asdfghjkl')

        let stringcallback = await client.callback('asdfghjkl', (progress) => {
            console.info(`client : ${progress}`)
        })
        strictEqual(stringcallback, 'hello callback asdfghjkl')

        let callbackCount = 0
        let stringcallback2 = await client.callback2('asdfghjkl', (progress, buffer) => {
            console.info(`client : ${progress}`, buffer)
            callbackCount++
        })
        strictEqual(3, callbackCount)
        strictEqual(stringcallback2, 'hello callback asdfghjkl')

        let buffer = Uint8Array_from('qwertyuiop')
        let slice = await client.buffer(buffer)
        deepStrictEqual(slice, buffer.slice(3, 8))

        let slice2 = await client.buffer(new Uint8Array(300000))
        deepStrictEqual(slice2, new Uint8Array(10).slice(3, 8))

        let array = await client.array('asdfghjkl', buffer)
        deepStrictEqual(array, [123, 'abc', 'hi asdfghjkl', buffer.slice(3, 8)])

        let retvoid = await client.void('asdfghjkl', buffer)
        strictEqual(retvoid, undefined)

        let retbuffer2 = await client.buffer2('asdfghjkl', new Uint8Array(300000))
        deepStrictEqual(retbuffer2, ['message:asdfghjkl', new Uint8Array(300).slice(3, 8)])
    })

})

test('测试RPC调用-KoaRouter', async () => {
    // node --test-name-pattern="^测试RPC调用-KoaRouter$" src/lib.test.js
    const extension = {
        hello: async function (/** @type {string} */ name) {
            return `hello ${name}`
        },
        callback: async function (/** @type {string} */ name, /** @type {(data: string) => void} */ update) {
            for (let i = 0; i < 3; i++) {
                update(`progress ${i}`)
                await sleep(30)
            }
            return `hello callback ${name}`
        },
        callback2: async function (/** @type {string} */ name, /** @type {(data: string, data2:Uint8Array) => void} */ update) {
            for (let i = 0; i < 3; i++) {
                update(`progress ${i}`, Uint8Array_from('2345'))
                await sleep(30)
            }
            return `hello callback ${name}`
        },
        buffer: async function (/** @type {Uint8Array} */ buffer) {
            return buffer.slice(3, 8)
        },
        array: async function (/** @type {string} */ name,/** @type {Uint8Array} */ buffer) {
            return [123, 'abc', 'hi ' + name, buffer.slice(3, 8)]
        },
        void: async function (/** @type {string} */ name,/** @type {Uint8Array} */ buffer) {
            console.info('call void')
        }
    }

    await runWithAbortController(async (ac) => {
        let server = createServer()
        let app = new Koa()
        let router = new Router()

        ac.signal.addEventListener('abort', () => { server.close() })
        createRpcServerKoaRouter({
            path: '/3f1d664e469aa24b54d6bad0d6d869c0',
            router: router,
            rpcKey: '11474f3dfbb861700cb6c3864b328311',
            extension: extension,
        })

        server.addListener('request', app.callback())
        app.use(router.routes())
        app.use(router.allowedMethods())

        server.listen(9000)
        await sleep(100)

        /** @type{typeof extension} */
        let client = createRpcClientHttp({
            url: `http://127.0.0.1:9000/3f1d664e469aa24b54d6bad0d6d869c0`,
            rpcKey: '11474f3dfbb861700cb6c3864b328311',
            signal: ac.signal,
        })
        await sleep(100)

        let string = await client.hello('asdfghjkl')
        console.info(string)
        strictEqual(string, 'hello asdfghjkl')

        let callbackCount = 0
        let stringcallback = await client.callback('asdfghjkl', (progress) => {
            console.info(`client : ${progress}`)
            callbackCount++
        })

        strictEqual(3, callbackCount)
        strictEqual(stringcallback, 'hello callback asdfghjkl')

        let stringcallback2 = await client.callback2('asdfghjkl', (progress, buffer) => {
            console.info(`client : ${progress}`, buffer)
        })
        strictEqual(stringcallback2, 'hello callback asdfghjkl')

        let buffer = Uint8Array_from('qwertyuiop')
        let slice = await client.buffer(buffer)
        deepStrictEqual(slice, buffer.slice(3, 8))

        let array = await client.array('asdfghjkl', buffer)
        deepStrictEqual(array, [123, 'abc', 'hi asdfghjkl', buffer.slice(3, 8)])

        let retvoid = await client.void('asdfghjkl', buffer)
        strictEqual(retvoid, undefined)
    })
    console.info('over!')
})

/**
 * @param {(ac: AbortController) => Promise<void>} func
 */
export async function runWithAbortController(func) {
    let ac = new AbortController()
    try {
        await func(ac)
        await sleep(1000)
    } finally { ac.abort() }
}
```

## Electron
```js
// main.js
class AppApi {
    asyncLocalStorage = new AsyncLocalStorage()

    async hello(param) {
        return 'wertyuioiuytre ' + param
    }
}

import { ipcMain } from 'electron'
import { createRpcServerElectronMessagePort } from 'js-rpc2/src/lib.js'

ipcMain.on('port', (event) => {
    const port = event.ports[0]
    createRpcServerElectronMessagePort({ port, rpcKey: '', extension: new AppApi() })
    port.start()
})

// preload.js
import { ipcRenderer } from 'electron/renderer'

window.onmessage = (/** @type {MessageEvent} */ event) => {
    if (event.isTrusted && event.data == 'port') {
        ipcRenderer.postMessage('port', null, [event.ports[0]])
    }
}

// renderer.js
import { createRpcClientMessagePort } from 'js-rpc2/src/lib.js'

const channel = new MessageChannel();
window.postMessage("port", location.origin, [channel.port1]);
let rpc = createRpcClientMessagePort({ port: channel.port2, rpcKey: "" });

// uasge.js
async function postPortMessage() {
    let ret = await rpc.hello('6667');
    console.info("ret from rpc:", ret);
}
```

## chrome extensions
```js
import {createRpcServerChromeExtensions, createRpcClientChromeExtensions} from 'js-rpc2/src/lib.js'

// background.js
export class RpcBackgroundApi {
    /**
     * @param {(progress: string, date: Date) => Promise<void>} cb
     */
    async callback(cb) {
        console.info('callback in background', 'cb')
        for (let i = 0; i < 10; i++) {
            await sleep(1000)
            await cb(`from background index is ${i}`, new Date())
        }
        return 'over!'
    }
}
createRpcServerChromeExtensions({ chrome, key: 'rpc-popup->background', extension: new RpcBackgroundApi(), })
createRpcServerChromeExtensions({ chrome, key: 'rpc-content-scripts->background', extension: new RpcBackgroundApi(), })


// content_scripts.js
export class RpcContentScriptsApi {
    async callBackgroundWithCallback(name, callback) {
        console.info('name', name)
        return await rpcContentScriptBackground.callback(callback)
    }
}
createRpcServerChromeExtensions({ chrome, key: 'rpc-popup->content-script', extension: new RpcContentScriptsApi() })
/** @type{RpcBackgroundApi} */
export const rpcContentScriptBackground = createRpcClientChromeExtensions({ chrome, key: 'rpc-content-scripts->background' })


// popup.js
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
/** @type{RpcContentScriptsApi} */
export const rpcPopupContentScripts = createRpcClientChromeExtensions({ chrome, key: 'rpc-popup->content-script', tabId: tab.id, })
/** @type{RpcBackgroundApi} */
export const rpcPopupBackground = createRpcClientChromeExtensions({ chrome, key: 'rpc-popup->background' })

let resp = await rpcPopupContentScripts.callBackgroundWithCallback("name", async (progress, date) => {
    console.info('at popup callback ',progress, date)
})
console.info("over!", resp)

let resp = await rpcPopupBackground.callback(async (progress, date) => {
    console.info('at popup callback ',progress, date)
})
console.info("over!", resp)
```
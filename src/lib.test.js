import { test } from 'node:test'
import { deepStrictEqual, ok, strictEqual } from 'node:assert'
import { createRpcClientHttp, createRpcClientWebSocket, sleep, Uint8Array_from } from './lib.js'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import Koa from 'koa'
import Router from 'koa-router'
import { createRpcServerKoaRouter, createRpcServerWebSocket } from './server.js'

test('basic', async () => {
    // node --test-name-pattern="^basic$" src/lib.test.js

    // server
    const app = new Koa()
    const router = new Router()
    app.use(router.routes())
    app.use(router.allowedMethods())
    let server = createServer(app.callback()).listen(9000)

    class RpcApi {
        /**
         * 
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


    // client

    /** @type{RpcApi} */
    const rpc = createRpcClientHttp({
        // url: `/rpc/abc`,                      // in same site html page
        url: `http://127.0.0.1:9000/rpc/abc`, // others
    })

    let ret = await rpc.hello('123', new Uint8Array(3), { q: 2, w: 3, e: 4 }, null, undefined, [1, 2, 3, 4], (message, num) => {
        console.info('callback', message, num)
    })
    console.info(ret)
    server.close()

})

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
        },
        longTimeBlock: async function () {
            await sleep(1000)
            return 'finished'
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

        let startTime = performance.now()
        let [time1, time2] = await Promise.all([
            client.longTimeBlock().then(v => {
                console.info('longTimeBlock', v)
                return performance.now() - startTime
            }),
            client.hello('欣瑶').then(v => {
                console.info('hello', v)
                return performance.now() - startTime
            })
        ])
        ok(time1 > 1000, `time1:${time1}`)
        ok(time2 < 10, `time2:${time2}`)
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


test('error-stack', async () => {
    // node --test-name-pattern="^error-stack$" src/lib.test.js

    // server
    const app = new Koa()
    const router = new Router()
    app.use(router.routes())
    app.use(router.allowedMethods())
    let server = createServer(app.callback()).listen(9000)

    class RpcApi {
        async hello() {
            new URL('/')
        }
    }

    const extension = new RpcApi()

    createRpcServerKoaRouter({
        path: '/rpc/abc',
        router: router,
        extension: extension,
    })


    // client

    /** @type{RpcApi} */
    const rpc = createRpcClientHttp({
        // url: `/rpc/abc`,                      // in same site html page
        url: `http://127.0.0.1:9000/rpc/abc`, // others
    })

    try {
        let ret = await rpc.hello()
        console.info(ret)
    } catch (error) {
        console.error(error)
    }
    server.close()

})
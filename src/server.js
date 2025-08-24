import { Readable } from "node:stream"
import { createRpcServerHelper } from "./lib.js"
import { AsyncLocalStorage } from "node:async_hooks"

/**
 * @import { IncomingMessage } from "node:http"
 * @import {WebSocketServer} from 'ws'
 */

export { createRpcServerHelper }

/**
 * @import Router from '@koa/router'
 */

/**
 * @template T
 * @param {{
 * path: string; 
 * wss: WebSocketServer; 
 * rpcKey:string;
 * extension: {asyncLocalStorage:AsyncLocalStorage<IncomingMessage>;}; 
 * logger?:(msg:string)=>void;
 * }} param
 */
export function createRpcServerWebSocket(param) {
    let asyncLocalStorage = param.extension.asyncLocalStorage
    if (!asyncLocalStorage) { asyncLocalStorage = new AsyncLocalStorage() }
    param.wss.on('connection', (ws, request) => {
        let url = request.url
        if (url != param.path) {
            return
        }
        let helper = createRpcServerHelper({ rpcKey: param.rpcKey, extension: param.extension, async: true, logger: param.logger })
        let writer = helper.writable.getWriter()
        helper.readable.pipeTo(new WritableStream({
            async write(chunk) {
                await new Promise((resolve) => {
                    ws.send(chunk, resolve)
                })
            }
        }))
        ws.on('message', async (data) => {
            /** @type{*} */
            let buffer = data
            if (writer.desiredSize <= 0) {
                ws.pause()
            }
            asyncLocalStorage.enterWith(request)
            await writer.write(buffer)
            ws.resume()
        })
        ws.on('close', () => {
            console.info('createRpcServerWebSocket connection ws close')
        })
        ws.on('error', (error) => {
            console.error('createRpcServerWebSocket connection ws error', error)
        })
    })
}

/**
 * @param {{
 * path: string; 
 * router: Router<any, {}>; 
 * rpcKey?:string;
 * logger?:(msg:string)=>void;
 * extension: {asyncLocalStorage:AsyncLocalStorage;}; 
 * }} param 
 */
export function createRpcServerKoaRouter(param) {
    let asyncLocalStorage = param.extension.asyncLocalStorage
    if (!asyncLocalStorage) { asyncLocalStorage = new AsyncLocalStorage() }
    param.router.post(param.path, async (ctx) => {
        asyncLocalStorage.enterWith(ctx)
        let helper = createRpcServerHelper({ rpcKey: param.rpcKey, extension: param.extension, logger: param.logger })
        let a = Readable.toWeb(ctx.req)
        await a.pipeThrough(new TransformStream({
            async transform(chunk, controller) {
                asyncLocalStorage.enterWith(ctx)
                controller.enqueue(chunk)
            }
        })).pipeTo(helper.writable)
        ctx.status = 200
        ctx.response.set({
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache',
            'Content-Type': 'application/octet-stream'
        })
        /** @type{object} */
        let b = helper.readable
        ctx.body = Readable.fromWeb(b)
    })
}

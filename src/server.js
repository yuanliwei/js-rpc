import { Readable } from "node:stream"
import { createRpcServerHelper } from "./lib.js"

/**
 * @import {WebSocketServer} from 'ws'
 */

export { createRpcServerHelper }

/**
 * @import Router from 'koa-router'
 */

/**
 * @param {{
 * path: string; 
 * wss: WebSocketServer; 
 * rpcKey:string;
 * extension: Object; 
 * }} param
 */
export function createRpcServerWebSocket(param) {
    param.wss.on('connection', (ws, request) => {
        let url = request.url
        if (url != param.path) {
            return
        }
        let helper = createRpcServerHelper({ rpcKey: param.rpcKey, extension: param.extension })
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
 * 
 * @param {{
 * path: string; 
 * router: Router<any, {}>; 
 * rpcKey?:string;
 * logger?:(msg:string)=>void;
 * extension: Object; 
 * }} param 
 */
export function createRpcServerKoaRouter(param) {
    param.router.post(param.path, async (ctx) => {
        let helper = createRpcServerHelper({ rpcKey: param.rpcKey, extension: param.extension, logger: param.logger })
        /** @type{ReadableStream} */
        let a = Readable.toWeb(ctx.req)
        await a.pipeTo(helper.writable)
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

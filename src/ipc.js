import net from 'node:net'
import { existsSync, unlinkSync } from 'node:fs'
import { Readable } from 'node:stream'
import { platform } from 'node:process'

/**
 * 跨平台生成 IPC 路径
 * @param {string} name
 * @returns {string}
 */
export function getPipePath(name) {
    if (platform === 'win32') {
        return `\\\\.\\pipe\\${name}`
    }
    return `/tmp/${name}.sock`
}

/**
 * 创建 IPC 服务端
 * @param {string} name
 * @returns {Promise<net.Server>}
 */
export async function createIPCServer(name) {
    const socketPath = getPipePath(name)
    if (platform !== 'win32' && existsSync(socketPath)) {
        unlinkSync(socketPath)
    }
    const server = net.createServer()
    await new Promise((resolve) => server.listen(socketPath, () => resolve()))
    return server
}

/**
 * 创建 IPC 客户端
 * @param {string} name
 * @returns {Promise<net.Socket>}
 */
export function createIPCClient(name) {
    const socketPath = getPipePath(name)
    const client = net.createConnection(socketPath)
    return new Promise((resolve, reject) => {
        client.once('connect', () => resolve(client))
        client.once('error', reject)
    })
}

/**
 * 将 Node.js Socket 桥接到 js-rpc2 helper 的 readable/writable
 * @param {net.Socket} socket
 * @param {{ writable: WritableStream, readable: ReadableStream }} helper
 */
export function bridgeSocketToHelper(socket, helper) {
    Readable.fromWeb(helper.readable).pipe(socket)
    const writer = helper.writable.getWriter()
    socket.on('data', async (chunk) => {
        try { await writer.write(chunk) } catch (_) { /* closed */ }
    })
    socket.on('end', () => writer.close().catch(() => { }))
    socket.on('error', () => writer.close().catch(() => { }))
}

import { createRpcServerHelper } from './lib.js'
import { createRpcClientHelper, createRPCProxy } from './lib.js'

/**
 * 创建 IPC RPC 服务端
 *
 * @param {{
 *   name: string;
 *   rpcKey: string;
 *   extension: object;
 *   logger?: (msg: string) => void;
 * }} param
 * @returns {Promise<net.Server>}
 */
export async function createRpcServerIPC(param) {
    const server = await createIPCServer(param.name)

    server.on('connection', (socket) => {
        const helper = createRpcServerHelper({
            rpcKey: param.rpcKey,
            extension: param.extension,
            async: true,
            logger: param.logger,
        })
        bridgeSocketToHelper(socket, helper)
        socket.on('error', (err) => {
            console.error('[RpcServerIPC] socket 错误:', err.message)
        })
    })

    server.on('error', (err) => {
        console.error('[RpcServerIPC] 服务器错误:', err.message)
    })

    return server
}

/**
 * 创建 IPC RPC 客户端，返回 {rpc, [Symbol.dispose]}
 * 支持 using 语法自动清理：
 *   using client = await createRpcClientIPC('myapp', 'mykey')
 *   const result = await client.rpc.hello('world')
 *
 * @template T
 * @param {string} name - IPC 管道名称
 * @param {string} rpcKey - 加密密钥
 * @returns {Promise<{rpc: T, [Symbol.dispose]: () => void}>}
 */
export async function createRpcClientIPC(name, rpcKey) {
    const socket = await createIPCClient(name)
    const helper = createRpcClientHelper({ rpcKey })
    bridgeSocketToHelper(socket, helper)
    const rpc = createRPCProxy(helper.apiInvoke)
    const close = () => socket.end()
    return { rpc, [Symbol.dispose]: close }
}

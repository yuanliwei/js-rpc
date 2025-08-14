import { Packr } from 'msgpackr'

/**
 * @import { CALLBACK_ITEM, ExtensionApi, RPC_DATA, RPC_DATA_ARG_ITEM } from "./types.js"
 */

const JS_RPC_WITH_CRYPTO = true

export const sleep = (/** @type {number} */ timeout) => new Promise((resolve) => setTimeout(resolve, timeout))

const packr = new Packr({ structuredClone: true, useBigIntExtension: true, moreTypes: true, copyBuffers: true, })

export function Promise_withResolvers() {
    /** @type{(value?:object)=>void} */
    let resolve = null
    /** @type{(reason?:object)=>void} */
    let reject = null
    const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

/**
 * @param {Promise<[CryptoKey,Uint8Array<ArrayBuffer>]>} key_iv
 * @returns {TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>}
 */
export function createEncodeStream(key_iv) {
    let key = null
    let iv = null
    return new TransformStream({
        async start() {
            [key, iv] = await key_iv
        },
        async transform(chunk, controller) {
            let buffer = await buildBufferData([chunk], key, iv)
            controller.enqueue(buffer)
        }
    })
}

/**
 * @param {Promise<[CryptoKey,Uint8Array<ArrayBuffer>]>} key_iv
 * @returns {TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>}
 */
export function createDecodeStream(key_iv) {
    let key = null
    let iv = null
    let last = new Uint8Array(0)
    return new TransformStream({
        async start() {
            [key, iv] = await key_iv
        },
        async transform(chunk, controller) {
            let [queueReceive, remain] = await parseBufferData(Uint8Array_concat([last, chunk]), key, iv)
            last = remain
            for (const o of queueReceive) {
                controller.enqueue(o)
            }
        }
    })
}

const HEADER_CHECK = 0xb1f7705f

/**
 * @param {Uint8Array<ArrayBuffer>[]} queue
 * @param {CryptoKey} key
 * @param {Uint8Array<ArrayBuffer>} iv
 * @returns {Promise<Uint8Array<ArrayBuffer>>}
 */
export async function buildBufferData(queue, key, iv) {
    let buffers = []
    for (const data of queue) {
        let offset = 0
        let header = new Uint8Array(8)
        let headerCheck = HEADER_CHECK
        let buffer = await encrypt(data, key, iv)
        writeUInt32LE(header, buffer.length, offset); offset += 4
        writeUInt32LE(header, headerCheck, offset); offset += 4
        buffers.push(header, buffer)
    }
    return Uint8Array_concat(buffers)
}

/**
 * @param {Uint8Array<ArrayBuffer>} buffer
 * @param {CryptoKey} key
 * @param {Uint8Array<ArrayBuffer>} iv
 * @returns {Promise<[Uint8Array<ArrayBuffer>[],Uint8Array<ArrayBuffer>]>}
 */
export async function parseBufferData(buffer, key, iv) {
    /** @type{Uint8Array<ArrayBuffer>[]} */
    let queue = []
    let offset = 0
    let remain = new Uint8Array(0)
    while (offset < buffer.length) {
        if (offset + 8 > buffer.length) {
            remain = buffer.subarray(offset)
            break
        }
        let bufferLength = readUInt32LE(buffer, offset); offset += 4
        let headerCheck = readUInt32LE(buffer, offset); offset += 4
        if (offset + bufferLength > buffer.length) {
            remain = buffer.subarray(offset - 8)
            break
        }
        let check = HEADER_CHECK
        if (check !== headerCheck) {
            remain = new Uint8Array(0)
            console.error('data check error!', bufferLength, check.toString(16), headerCheck.toString(16))
            break
        }
        let data = buffer.subarray(offset, offset + bufferLength); offset += bufferLength
        let buf = await decrypt(data, key, iv)
        queue.push(buf)
    }
    return [queue, remain]
}

export function processPackets() {
    let last = new Uint8Array(0)
    return new TransformStream({
        async transform(chunk, controller) {
            let [queueReceive, remain] = await parseBufferData(Uint8Array_concat([last, chunk]), null, null)
            last = remain
            if (queueReceive.length > 0) {
                let buffer = await buildBufferData(queueReceive, null, null)
                controller.enqueue(buffer)
            }
        }
    })
}

/**
 * @param {Uint8Array<ArrayBuffer>} buffer
 * @param {number} offset
 */
export function readUInt32LE(buffer, offset) {
    if (offset < 0 || offset + 4 > buffer.length) throw new RangeError('Reading out of bounds')
    return ((buffer[offset] & 0xff) |
        ((buffer[offset + 1] & 0xff) << 8) |
        ((buffer[offset + 2] & 0xff) << 16) |
        ((buffer[offset + 3] & 0xff) << 24)) >>> 0 // >>> 0 to convert to unsigned
}

/**
 * @param {Uint8Array<ArrayBuffer>} buffer
 * @param {number} value
 * @param {number} offset
 */
export function writeUInt32LE(buffer, value, offset) {
    if (offset < 0 || offset + 4 > buffer.length) throw new RangeError('Writing out of bounds')
    buffer[offset] = value & 0xff
    buffer[offset + 1] = (value >> 8) & 0xff
    buffer[offset + 2] = (value >> 16) & 0xff
    buffer[offset + 3] = (value >> 24) & 0xff
}

/**
 * @param {Uint8Array<ArrayBuffer>[]} buffers
 */
export function Uint8Array_concat(buffers) {
    const totalLength = buffers.reduce((sum, buffer) => sum + buffer.length, 0)
    const resultBuffer = new Uint8Array(totalLength)
    let offset = 0
    for (const buffer of buffers) {
        resultBuffer.set(buffer, offset)
        offset += buffer.length
    }
    return resultBuffer
}

/**
 * @param {*} array
 * @param {'utf-8'|'hex'|'base64'} [encoding]
 */
export function Uint8Array_from(array, encoding) {
    if (encoding == 'hex') {
        array = new Uint8Array(array.match(/[\da-f]{2}/gi).map((h) => parseInt(h, 16)))
    }
    if (encoding == 'base64') {
        array = Uint8Array.from(atob(array), (o) => o.codePointAt(0))
    }
    if (encoding == 'utf-8') {
        array = new TextEncoder().encode(array)
    }
    if (typeof array === 'string') {
        array = new TextEncoder().encode(array)
    }
    if (Array.isArray(array) || array instanceof Uint8Array) {
        return new Uint8Array(array)
    }
    throw new TypeError('Argument must be an array or Uint8Array')
}

/**
 * @param {Uint8Array<ArrayBuffer>} buffer
 * @param {'utf-8' | 'hex' | 'base64'} [encoding]
 */
export function Uint8Array_toString(buffer, encoding = 'utf-8') {
    if (encoding == 'hex') {
        return Array.from(buffer).map((b) => b.toString(16).padStart(2, "0")).join('')
    }
    if (encoding == 'base64') {
        return btoa(String.fromCharCode(...buffer))
    }
    // utf-8
    return new TextDecoder().decode(buffer)
}

/**
 * @param {number} number
 */
function buildBufferNumberUInt32LE(number) {
    let buffer = new Uint8Array(4)
    writeUInt32LE(buffer, number, 0)
    return buffer
}

/**
 * @param {string} string
 */
function buildBufferSizeString(string) {
    let buffer = new TextEncoder().encode(string)
    return Uint8Array_concat([
        buildBufferNumberUInt32LE(buffer.length),
        buffer,
    ])
}

/**
 * @param {Uint8Array<ArrayBuffer>} buffer
 * @param {number} offset
 */
function readBufferSizeString(buffer, offset) {
    let size = readUInt32LE(buffer, offset)
    let start = offset + 4
    let end = start + size
    let string = new TextDecoder().decode(buffer.slice(start, end))
    return { size: 4 + size, string }
}

export function guid() {
    let buffer = new Uint8Array(16)
    if (globalThis.crypto) {
        crypto.getRandomValues(buffer)
    } else {
        for (let i = 0; i < buffer.length; i++) {
            buffer[i] = Math.floor(Math.random() * 256)
        }
    }
    return Array.from(buffer).map((o) => o.toString(16).padStart(2, '0')).join('')
}

/**
 * 
 * @param {string} password 
 * @param {number} iterations 
 * @returns {Promise<[CryptoKey,Uint8Array<ArrayBuffer>]>}
 */
export async function buildKeyIv(password, iterations) {
    if (!JS_RPC_WITH_CRYPTO) return [null, null]
    if (!password) return [null, null]
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits", "deriveKey"],
    )
    const salt = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(password))
    const pbkdf2Params = {
        name: "PBKDF2",
        salt,
        iterations: iterations,
        hash: "SHA-256",
    }
    const key = await crypto.subtle.deriveKey(
        pbkdf2Params,
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"],
    )
    const iv = await crypto.subtle.deriveBits(
        pbkdf2Params,
        keyMaterial,
        256,
    )
    return [key, new Uint8Array(iv)]
}

/**
 * 
 * @param {Uint8Array<ArrayBuffer>} data 
 * @param {CryptoKey} key 
 * @param {Uint8Array<ArrayBuffer>} iv 
 * @returns 
 */
export async function encrypt(data, key, iv) {
    if (!JS_RPC_WITH_CRYPTO) return data
    if (!key) return data
    const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv }, key, data
    )
    return new Uint8Array(encryptedData)
}

/**
 * @param {Uint8Array<ArrayBuffer>} data 
 * @param {CryptoKey} key 
 * @param {Uint8Array<ArrayBuffer>} iv 
 * @returns 
 */
export async function decrypt(data, key, iv) {
    if (!JS_RPC_WITH_CRYPTO) return data
    if (!key) return data
    const encryptedArray = data
    const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv }, key, encryptedArray
    )
    return new Uint8Array(decryptedData)
}

/**
 * @param {AbortSignal} signal
 * @param {()=> Promise<void>} callback
 */
export async function timeWaitRetryLoop(signal, callback) {
    let waitTime = 300
    while (!signal.aborted) {
        let time = performance.now()
        try {
            await callback()
        } catch (error) {
            console.error('timeWaitRetryLoop', error.message)
        }
        if (performance.now() - time > 10_000) {
            waitTime = 300
        }
        await sleep(waitTime)
        waitTime *= 2
        if (waitTime > 60_000) {
            waitTime = 60_000
        }
    }
}

export const RPC_TYPE_CALL = 0xdf68f4cb
export const RPC_TYPE_RETURN = 0x68b17581
export const RPC_TYPE_CALLBACK = 0x8d65e5cc
export const RPC_TYPE_ERROR = 0xa07c0f84

export const RPC_DATA_ARG_TYPE_OTHERS = 0xa7f68c
export const RPC_DATA_ARG_TYPE_FUNCTION = 0x7ff45f

/**
 * @typedef {RPC_DATA_ARG_TYPE_OTHERS|RPC_DATA_ARG_TYPE_FUNCTION} RPC_DATA_ARG_TYPE
 */

/**
 * @param {RPC_DATA} box
 */
export function buildRpcData(box) {
    let type = box.type
    let data = box.data
    if (type == RPC_TYPE_CALL || type == RPC_TYPE_CALLBACK) {
        data = data.map(({ type, data }) => [type, data])
    }
    return Uint8Array.from(packr.pack([box.id, type, data]))
}

/**
 * @param {Uint8Array<ArrayBuffer>} buffer
 */
export function parseRpcData(buffer) {
    let [id, type, data] = packr.unpack(buffer)
    if (type == RPC_TYPE_CALL || type == RPC_TYPE_CALLBACK) {
        data = data.map(([type, data]) => ({ type, data }))
    }
    /** @type{RPC_DATA} */
    return { id, type, data }
}

/**
 * @param {object[]} items
 */
export function buildRpcItemData(items) {
    /** @type{RPC_DATA_ARG_ITEM[]} */
    let arr = []
    for (const item of items) {
        /** @type{RPC_DATA_ARG_TYPE} */
        let type = null
        let data = null
        if (typeof item == 'function') {
            type = RPC_DATA_ARG_TYPE_FUNCTION
            data = item()
        } else {
            type = RPC_DATA_ARG_TYPE_OTHERS
            data = item
        }
        arr.push({ type, data })
    }
    return arr
}

/**
 * @template T
 * @param {ExtensionApi<T>} extension
 * @param {WritableStreamDefaultWriter<Uint8Array<ArrayBuffer>>} writer
 * @param {Uint8Array<ArrayBuffer>} buffer
 * @param {(msg:string)=>void} logger
 */
export async function rpcRunServerDecodeBuffer(extension, writer, buffer, logger) {
    /** @type{RPC_DATA} */
    let box = null
    let dataId = 0
    let fnName = null
    let params = []
    let time = Date.now()
    try {
        let o = parseRpcData(buffer)
        dataId = o.id
        let items = o.data
        fnName = items.at(0).data
        let args = items.slice(1)
        for (let i = 0; i < args.length; i++) {
            const p = args[i]
            if (p.type == RPC_DATA_ARG_TYPE_FUNCTION) {
                const callback = async (/** @type {any[]} */ ...args) => {
                    /** @type{RPC_DATA} */
                    let box = { id: p.data, type: RPC_TYPE_CALLBACK, data: buildRpcItemData(args), }
                    try {
                        await writer.write(buildRpcData(box))
                    } catch (error) {
                        throw new Error(`rpc callback writer.write()`, { cause: error })
                    }
                }
                params.push(callback)
            } else {
                params.push(p.data)
            }
        }
        let ret = await extension[fnName](...params)
        box = { id: o.id, type: RPC_TYPE_RETURN, data: ret, }
    } catch (error) {
        console.error('rpcRunServerDecodeBuffer', fnName, params.map(o => {
            if (typeof o == 'function') { return 'function' }
            return o
        }), error)
        box = {
            id: dataId,
            type: RPC_TYPE_ERROR,
            data: { message: error.message, stack: error.stack },
        }
    }
    if (logger) {
        logger(`time: ${Date.now() - time}ms ${fnName}(${params.map(o => {
            if (typeof o == 'function') { return `Function()` }
            if (o instanceof Uint8Array) { return `Uint8Array(${o.length})` }
            return o
        }).join(', ')})`)
    }
    await writer.write(buildRpcData(box))
}

/**
 * @param {(fnName:string,args:object[])=>Promise<object>} apiInvoke
 */
export function createRPCProxy(apiInvoke) {
    const map = new Map()
    const proxy = new Proxy(Object(), {
        get(_target, p) {
            let proxy = map.get(p)
            if (proxy) {
                return proxy
            }
            proxy = new Proxy(Function, {
                async apply(_target, _thisArg, argArray) {
                    try {
                        return await apiInvoke(String(p), argArray)
                    } catch (error) {
                        throw new RPCError(error.message, null, { cause: error })
                    }
                }
            })
            map.set(p, proxy)
            return proxy
        }
    })
    return proxy
}

/** 
 * @typedef {{
 * writable: WritableStream<Uint8Array<ArrayBuffer>>;
 * readable: ReadableStream<Uint8Array<ArrayBuffer>>;
 * }} RPC_HELPER_SERVER
 */

/**
 * @template T
 * @param {{ 
 * rpcKey: string; 
 * extension: ExtensionApi<T>;
 * logger?: (msg:string)=>void; 
 * async?: boolean; 
 * context?:any;
 * }} param
 */
export function createRpcServerHelper(param) {
    let rpc_key_iv = buildKeyIv(param.rpcKey, 10)
    const encode = createEncodeStream(rpc_key_iv)
    const decode = createDecodeStream(rpc_key_iv)
    let writer = encode.writable.getWriter()
    decode.readable.pipeTo(new WritableStream({
        async write(buffer) {
            let asyncLocalStorage = param.extension.asyncLocalStorage
            asyncLocalStorage.enterWith(param.context)
            if (param.async) {
                rpcRunServerDecodeBuffer(param.extension, writer, buffer, param.logger).catch(console.error)
            } else {
                await rpcRunServerDecodeBuffer(param.extension, writer, buffer, param.logger)
            }
        },
        async close() {
            await writer.close()
        }
    })).catch(console.error)

    /** @type{RPC_HELPER_SERVER} */
    let ret = { writable: decode.writable, readable: encode.readable }
    return ret
}

/** 
 * @typedef {{
 * writable: WritableStream<Uint8Array<ArrayBuffer>>;
 * readable: ReadableStream<Uint8Array<ArrayBuffer>>;
 * apiInvoke: (fnName: string, args: object[]) => Promise<object>;
 * reject: (error:object)=>void;
 * }} RPC_HELPER_CLIENT
 */

class RPCError extends Error {
    /**
     * @param {string} message
     * @param {string} stack
     * @param {ErrorOptions} [option]
     */
    constructor(message, stack, option) {
        super(message, option)
        if (stack) {
            this.stack = stack
        }
    }
}

/**
 * @param {{ rpcKey: string; }} param
 */
export function createRpcClientHelper(param) {

    let uniqueKeyID = 0

    /** @type{Map<number,CALLBACK_ITEM>} */
    const callbackFunctionMap = new Map()

    let rpc_key_iv = buildKeyIv(param.rpcKey, 10)
    let decode = createDecodeStream(rpc_key_iv)
    let encode = createEncodeStream(rpc_key_iv)
    let writer = encode.writable.getWriter()
    decode.readable.pipeTo(new WritableStream({
        async write(buffer) {
            try {
                let data = parseRpcData(buffer)
                let items = data.data
                if (callbackFunctionMap.has(data.id)) {
                    let o = callbackFunctionMap.get(data.id)
                    if (data.type == RPC_TYPE_ERROR) {
                        let error = data.data
                        o.promise.reject(new RPCError(error.message, error.stack))
                    }
                    if (data.type == RPC_TYPE_RETURN) {
                        callbackFunctionMap.delete(data.id)
                        o.promise.resolve(data.data)
                    }
                    if (data.type == RPC_TYPE_CALLBACK) {
                        let args = items.map((/** @type {{ data: any; }} */ o) => o.data)
                        o.callback.apply(o, args)
                    }
                }
            } catch (error) {
                console.error('apiInvoke', error)
                callbackFunctionMap.forEach((o) => {
                    o.promise?.reject(error)
                })
                callbackFunctionMap.clear()
            }
        }
    }))

    /**
     * @param {string} fnName
     * @param {object[]} args
     */
    async function apiInvoke(fnName, args) {
        let id = uniqueKeyID++
        let promise = Promise_withResolvers()
        callbackFunctionMap.set(id, { id, type: RPC_TYPE_RETURN, promise })
        const keys = []
        /** @type{object[]} */
        let argArray = []
        argArray.push(fnName)
        for (const arg of args) {
            if (arg instanceof Function) {
                const isAsyncFunction = arg.constructor?.name === 'AsyncFunction'
                if (!isAsyncFunction) {
                    const receivedType = arg.constructor?.name || 'regular function'
                    throw new Error(
                        `Expected an AsyncFunction as the callback, but received a ${receivedType}. ` +
                        'Ensure the callback is declared with "async function" or an arrow function using "async".'
                    )
                }
                const key = uniqueKeyID++
                keys.push(key)
                callbackFunctionMap.set(key, { id: key, type: RPC_TYPE_CALLBACK, callback: arg })
                argArray.push(() => key)
            } else {
                argArray.push(arg)
            }
        }
        try {
            /** @type{RPC_DATA} */
            let box = { id: id, type: RPC_TYPE_CALL, data: buildRpcItemData(argArray) }
            await writer.write(buildRpcData(box))
            return await promise.promise
        } finally {
            for (const key of keys) {
                callbackFunctionMap.delete(key)
            }
        }
    }

    /**
     * @param {object} error
     */
    function reject(error) {
        callbackFunctionMap.forEach((o) => {
            o.promise?.reject(error)
        })
        callbackFunctionMap.clear()
    }

    /** @type{RPC_HELPER_CLIENT} */
    let ret = { writable: decode.writable, readable: encode.readable, apiInvoke, reject }
    return ret
}

/**
 * @param {{
 * url:string;
 * rpcKey:string;
 * signal:AbortSignal;
 * intercept?:(e:Event)=>void;
 * }} param
 */
export function createRpcClientWebSocket(param) {
    let helper = createRpcClientHelper({ rpcKey: param.rpcKey })
    let writer = helper.writable.getWriter()
    let signal = Promise_withResolvers()
    /** @type{WritableStreamDefaultWriter<Uint8Array<ArrayBuffer>>} */
    let socketWriter = null
    helper.readable.pipeTo(new WritableStream({
        async write(chunk) {
            while (!param.signal.aborted && socketWriter == null) {
                await signal.promise
            }
            if (!param.signal.aborted) {
                await socketWriter.write(chunk)
            }
        }
    }))
    async function createWebSocket() {
        let promise = Promise_withResolvers()
        let ws = new WebSocket(param.url)
        ws.addEventListener('open', () => {
            console.info('createRpcClientWebSocket createWebSocket ws on open')
            socketWriter = new WritableStream({
                async write(chunk) {
                    ws.send(chunk)
                }
            }).getWriter()
            ws.addEventListener('message', async (ev) => {
                let buffer = await ev.data.arrayBuffer()
                await writer.write(new Uint8Array(buffer))
            })
            signal.resolve()
        })
        ws.addEventListener('error', (e) => {
            if (param.intercept) {
                param.intercept(e)
            }
            console.error('createRpcClientWebSocket createWebSocket ws error', e)
            promise.resolve()
        })
        ws.addEventListener('close', () => {
            console.error('createRpcClientWebSocket createWebSocket ws close')
            promise.resolve()
        })
        const listenerAC = () => { ws.close() }
        param.signal.addEventListener('abort', listenerAC)
        await promise.promise
        param.signal.removeEventListener('abort', listenerAC)
        socketWriter = null
        signal.resolve()
        signal = Promise_withResolvers()
    }
    timeWaitRetryLoop(param.signal, async () => {
        console.info('createRpcClientWebSocket timeWaitRetryLoop connectWebSocket')
        await createWebSocket()
    })

    return createRPCProxy(helper.apiInvoke)
}

/**
 * @param {{
 * url:string;
 * rpcKey?:string;
 * signal?:AbortSignal;
 * intercept?:(res:Response)=>void;
 * }} param
 */
export function createRpcClientHttp(param) {
    let helper = createRpcClientHelper({ rpcKey: param.rpcKey })
    let writer = helper.writable.getWriter()
    helper.readable.pipeTo(new WritableStream({
        write(chunk) {
            fetch(param.url, {
                method: 'POST',
                signal: param.signal,
                body: chunk,
            }).then(res => {
                if (param.intercept) {
                    param.intercept(res)
                }
                res.body.pipeThrough(processPackets()).pipeTo(new WritableStream({
                    async write(chunk) {
                        await writer.write(chunk)
                    }
                })).catch((e) => {
                    helper.reject(e)
                })
            }).catch(e => {
                helper.reject(e)
            })
        }
    })).catch((err) => helper.reject(err))
    return createRPCProxy(helper.apiInvoke)
}

/**
 * @template T
 * @param {{
 * port:MessagePort;
 * rpcKey:string;
 * extension: ExtensionApi<T>; 
 * logger?:(msg:string)=>void;
 * }} param 
 */
export function createRpcServerMessagePort(param) {
    const port = param.port
    let helper = createRpcServerHelper({
        rpcKey: '', extension: param.extension, async: true, logger: param.logger,
    })
    let writer = helper.writable.getWriter()
    port.onmessage = async (event) => {
        await writer.write(event.data)
    }
    helper.readable.pipeTo(new WritableStream({
        async write(chunk) {
            port.postMessage(chunk)
        }
    }))
}

/**
 * @import {Electron} from './types.js'
 * @template T
 * @param {{
 * port:Electron.MessagePortMain;
 * rpcKey:string;
 * extension: ExtensionApi<T>; 
 * logger?:(msg:string)=>void;
 * }} param 
 */
export function createRpcServerElectronMessagePort(param) {
    const port = param.port
    let helper = createRpcServerHelper({
        rpcKey: '', extension: param.extension, async: true, logger: param.logger,
    })
    let writer = helper.writable.getWriter()
    port.on('message', async (event) => {
        await writer.write(event.data)
    })
    helper.readable.pipeTo(new WritableStream({
        async write(chunk) {
            port.postMessage(chunk)
        }
    }))
}

/**
 * @param {{
 * port:MessagePort;
 * rpcKey:string;
 * }} param
 */
export function createRpcClientMessagePort(param) {
    let helper = createRpcClientHelper({ rpcKey: param.rpcKey })
    let writer = helper.writable.getWriter()
    helper.readable.pipeTo(new WritableStream({
        async write(chunk) {
            param.port.postMessage(chunk)
        }
    }))
    param.port.onmessage = async (event) => {
        await writer.write(event.data)
    }
    return createRPCProxy(helper.apiInvoke)
}

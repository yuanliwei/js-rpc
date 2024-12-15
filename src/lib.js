const JS_RPC_WITH_CRYPTO = true

export const sleep = (/** @type {number} */ timeout) => new Promise((resolve) => setTimeout(resolve, timeout))


/**
 * @typedef {{
 * promise: Promise<any>;
 * resolve: (value: any | null) => void;
 * reject: (reason: any | null) => void;
 * }} PromiseResolvers
 */

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
 * @param {Promise<[CryptoKey,Uint8Array]>} key_iv
 * @returns {TransformStream<Uint8Array, Uint8Array>}
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
 * @param {Promise<[CryptoKey,Uint8Array]>} key_iv
 * @returns {TransformStream<Uint8Array, Uint8Array>}
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
 * @param {Uint8Array[]} queue
 * @param {CryptoKey} key
 * @param {Uint8Array} iv
 * @returns {Promise<Uint8Array>}
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
 * @param {Uint8Array} iv
 * @returns {Promise<[Uint8Array[],Uint8Array<ArrayBuffer>]>}
 */
export async function parseBufferData(buffer, key, iv) {
    /** @type{Uint8Array[]} */
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
 * @param {Uint8Array} buffer
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
 * @param {Uint8Array} buffer
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
 * @param {Uint8Array[]} buffers
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
 * @param {Uint8Array} buffer
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
 * @param {Uint8Array} buffer
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
 * @returns {Promise<[CryptoKey,Uint8Array]>}
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
 * @param {Uint8Array} data 
 * @param {CryptoKey} key 
 * @param {Uint8Array} iv 
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
 * @param {Uint8Array} data 
 * @param {CryptoKey} key 
 * @param {Uint8Array} iv 
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
export const RPC_TYPE_RETURN_ARRAY = 0xceddbf64
export const RPC_TYPE_CALLBACK = 0x8d65e5cc
export const RPC_TYPE_ERROR = 0xa07c0f84

/**
 * @typedef {RPC_TYPE_CALL
 * |RPC_TYPE_RETURN
 * |RPC_TYPE_RETURN_ARRAY
 * |RPC_TYPE_CALLBACK
 * |RPC_TYPE_ERROR} RPC_TYPES
 */

/**
 * @typedef {{
 * id:number;
 * type:RPC_TYPES;
 * promise?:PromiseResolvers;
 * callback?:(...data:object)=>void;
 * }} CALLBACK_ITEM
 */

/**
 * @typedef {{type:RPC_DATA_AGR_TYPE;data:object}} RPC_DATA_ARG_ITEM
 * @typedef {{
 * id:number;
 * type:RPC_TYPES;
 * data:{type:RPC_DATA_AGR_TYPE;data:object}[];
 * }} RPC_DATA
 */

export const RPC_DATA_AGR_TYPE_OBJECT = 0xa7f68c
export const RPC_DATA_AGR_TYPE_FUNCTION = 0x7ff45f
export const RPC_DATA_AGR_TYPE_UINT8ARRAY = 0xedb218
export const RPC_DATA_AGR_TYPE_UNDEFINED = 0x7f77fe
export const RPC_DATA_AGR_TYPE_NULL = 0x5794f9

/**
 * @typedef {RPC_DATA_AGR_TYPE_OBJECT
 * |RPC_DATA_AGR_TYPE_FUNCTION
 * |RPC_DATA_AGR_TYPE_UINT8ARRAY
 * |RPC_DATA_AGR_TYPE_UNDEFINED
 * |RPC_DATA_AGR_TYPE_NULL} RPC_DATA_AGR_TYPE
 */

/**
 * @param {RPC_DATA} box
 */
export function buildRpcData(box) {
    let buffers = [
        buildBufferNumberUInt32LE(box.id),
        buildBufferNumberUInt32LE(box.type),
        buildBufferNumberUInt32LE(box.data.length),
    ]
    for (const o of box.data) {
        if (o.type == RPC_DATA_AGR_TYPE_UINT8ARRAY) {
            buffers.push(buildBufferNumberUInt32LE(o.type))
            buffers.push(buildBufferNumberUInt32LE(o.data.length))
            buffers.push(o.data)
        }
        if (o.type == RPC_DATA_AGR_TYPE_FUNCTION) {
            buffers.push(buildBufferNumberUInt32LE(o.type))
            buffers.push(buildBufferSizeString(o.data))
        }
        if (o.type == RPC_DATA_AGR_TYPE_OBJECT) {
            buffers.push(buildBufferNumberUInt32LE(o.type))
            buffers.push(buildBufferSizeString(JSON.stringify(o.data)))
        }
        if (o.type == RPC_DATA_AGR_TYPE_UNDEFINED) {
            buffers.push(buildBufferNumberUInt32LE(o.type))
        }
        if (o.type == RPC_DATA_AGR_TYPE_NULL) {
            buffers.push(buildBufferNumberUInt32LE(o.type))
        }
    }
    return Uint8Array_concat(buffers)
}

/**
 * @param {Uint8Array} buffer
 */
export function parseRpcData(buffer) {
    let offset = 0
    let id = readUInt32LE(buffer, offset)
    offset += 4
    /** @type{*} */
    let type = readUInt32LE(buffer, offset)
    offset += 4
    let dataLength = readUInt32LE(buffer, offset)
    offset += 4
    /** @type{RPC_DATA_ARG_ITEM[]} */
    let args = []
    for (let i = 0; i < dataLength; i++) {
        let type = readUInt32LE(buffer, offset)
        offset += 4
        if (type == RPC_DATA_AGR_TYPE_UINT8ARRAY) {
            let size = readUInt32LE(buffer, offset)
            offset += 4
            let data = buffer.slice(offset, offset + size)
            offset += size
            args.push({ type: type, data })
        }
        if (type == RPC_DATA_AGR_TYPE_FUNCTION) {
            let o = readBufferSizeString(buffer, offset)
            offset += o.size
            args.push({ type: type, data: o.string })
        }
        if (type == RPC_DATA_AGR_TYPE_OBJECT) {
            let o = readBufferSizeString(buffer, offset)
            offset += o.size
            let data = o.string
            args.push({ type: type, data: JSON.parse(data) })
        }
        if (type == RPC_DATA_AGR_TYPE_UNDEFINED) {
            args.push({ type: type, data: undefined })
        }
        if (type == RPC_DATA_AGR_TYPE_NULL) {
            args.push({ type: type, data: null })
        }
    }
    /** @type{RPC_DATA} */
    let box = { id, type, data: args }
    return box
}

/**
 * @param {object[]} items
 */
export function buildRpcItemData(items) {
    /** @type{RPC_DATA_ARG_ITEM[]} */
    let arr = []
    for (const item of items) {
        /** @type{RPC_DATA_AGR_TYPE} */
        let type = null
        let data = null
        if (item === undefined) {
            type = RPC_DATA_AGR_TYPE_UNDEFINED
            data = item
        } else if (item === null) {
            type = RPC_DATA_AGR_TYPE_NULL
            data = item
        } else if (item instanceof Uint8Array) {
            type = RPC_DATA_AGR_TYPE_UINT8ARRAY
            data = item
        } else if (typeof item == 'function') {
            type = RPC_DATA_AGR_TYPE_FUNCTION
            data = item()
        } else {
            type = RPC_DATA_AGR_TYPE_OBJECT
            data = JSON.stringify(item)
        }
        arr.push({ type, data })
    }
    return arr
}

/**
 * @param {RPC_DATA_ARG_ITEM[]} array
 */
export function parseRpcItemData(array) {
    /** @type{RPC_DATA_ARG_ITEM[]} */
    let items = []
    for (let i = 0; i < array.length; i++) {
        const o = array[i]
        if (o.type == RPC_DATA_AGR_TYPE_FUNCTION) {
            o.data = o.data
        }
        if (o.type == RPC_DATA_AGR_TYPE_NULL) {
            o.data = null
        }
        if (o.type == RPC_DATA_AGR_TYPE_UNDEFINED) {
            o.data = undefined
        }
        if (o.type == RPC_DATA_AGR_TYPE_UINT8ARRAY) {
            o.data = o.data
        }
        if (o.type == RPC_DATA_AGR_TYPE_OBJECT) {
            o.data = JSON.parse(o.data)
        }
        items.push(o)
    }
    return items
}

/**
 * @param {object} extension
 * @param {WritableStreamDefaultWriter<Uint8Array>} writer
 * @param {Uint8Array} buffer
 */
export async function rpcRunServerDecodeBuffer(extension, writer, buffer) {
    /** @type{RPC_DATA} */
    let box = null
    let dataId = 0
    try {
        let o = parseRpcData(buffer)
        dataId = o.id
        let items = parseRpcItemData(o.data)
        let fnName = items.at(0).data
        let args = items.slice(1)
        let params = []
        for (let i = 0; i < args.length; i++) {
            const p = args[i]
            if (p.type == RPC_DATA_AGR_TYPE_FUNCTION) {
                const callback = async (/** @type {any[]} */ ...args) => {
                    /** @type{RPC_DATA} */
                    let box = { id: p.data, type: RPC_TYPE_CALLBACK, data: buildRpcItemData(args), }
                    await writer.write(buildRpcData(box))
                }
                params.push(callback)
            } else {
                params.push(p.data)
            }
        }
        let ret = await extension[fnName](...params)
        if (Array.isArray(ret)) {
            box = { id: o.id, type: RPC_TYPE_RETURN_ARRAY, data: buildRpcItemData(ret), }
        } else {
            box = { id: o.id, type: RPC_TYPE_RETURN, data: buildRpcItemData([ret]), }
        }
    } catch (error) {
        console.error(error)
        box = {
            id: dataId,
            type: RPC_TYPE_ERROR,
            data: buildRpcItemData([`Error:${error.message}\n${error.stack}`]),
        }
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
                    return await apiInvoke(String(p), argArray)
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
 * writable: WritableStream<Uint8Array>;
 * readable: ReadableStream<Uint8Array>;
 * }} RPC_HELPER_SERVER
 */

/**
 * @param {{ 
 * rpcKey: string; 
 * extension: object; 
 * }} param
 */
export function createRpcServerHelper(param) {
    let rpc_key_iv = buildKeyIv(param.rpcKey, 10)
    const encode = createEncodeStream(rpc_key_iv)
    const decode = createDecodeStream(rpc_key_iv)
    let writer = encode.writable.getWriter()
    decode.readable.pipeTo(new WritableStream({
        async write(buffer) {
            await rpcRunServerDecodeBuffer(param.extension, writer, buffer)
        },
        async close() {
            await writer.close()
        }
    }))

    /** @type{RPC_HELPER_SERVER} */
    let ret = { writable: decode.writable, readable: encode.readable }
    return ret
}

/** 
 * @typedef {{
 * writable: WritableStream<Uint8Array>;
 * readable: ReadableStream<Uint8Array>;
 * apiInvoke: (fnName: string, args: object[]) => Promise<object>;
 * }} RPC_HELPER_CLIENT
 */

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
                let items = parseRpcItemData(data.data)
                if (callbackFunctionMap.has(data.id)) {
                    let o = callbackFunctionMap.get(data.id)
                    if (data.type == RPC_TYPE_ERROR) {
                        o.promise.reject(new Error(items.at(0).data))
                    }
                    if (data.type == RPC_TYPE_RETURN) {
                        callbackFunctionMap.delete(data.id)
                        o.promise.resolve(items.at(0).data)
                    }
                    if (data.type == RPC_TYPE_RETURN_ARRAY) {
                        callbackFunctionMap.delete(data.id)
                        o.promise.resolve(items.map(o => o.data))
                    }
                    if (data.type == RPC_TYPE_CALLBACK) {
                        o.callback(...items.map(o => o.data))
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

    /** @type{RPC_HELPER_CLIENT} */
    let ret = { writable: decode.writable, readable: encode.readable, apiInvoke }
    return ret
}

/**
 * @param {{
 * url:string;
 * rpcKey:string;
 * signal:AbortSignal;
 * }} param
 */
export function createRpcClientWebSocket(param) {
    let helper = createRpcClientHelper({ rpcKey: param.rpcKey })
    let writer = helper.writable.getWriter()
    let signal = Promise_withResolvers()
    /** @type{WritableStreamDefaultWriter<Uint8Array>} */
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
                })).catch((e) => console.error(e))
            }).catch(e => console.error(e))
        }
    })).catch((err) => console.error('createRpcClientHttp', err.message))
    return createRPCProxy(helper.apiInvoke)
}

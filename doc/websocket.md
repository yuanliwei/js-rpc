# WebSocket 使用文档

## 概述

js-rpc 支持通过 WebSocket 协议进行 RPC 调用，提供了比 HTTP 更高效的双向通信能力。WebSocket 传输适用于需要实时通信、频繁交互或长时间连接的应用场景。

## 核心组件

### 服务器端

1. [createRpcServerWebSocket](../src/server.js#L37) - 创建 WebSocket RPC 服务器
2. [createRpcServerHelper](../src/lib.js#L467) - 创建 RPC 服务器助手（内部使用）

### 客户端

1. [createRpcClientWebSocket](../src/lib.js#L656) - 创建 WebSocket RPC 客户端

## 完整示例

### 1. 服务器端代码 (server.js)

```js
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { createRpcServerWebSocket } from 'js-rpc2/src/server.js'

// 创建 HTTP 服务器
const server = createServer()

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ server })

// 定义可远程调用的函数
class RpcApi {
    /**
     * 示例方法：带回调的异步函数
     * @param {string} name - 名称参数
     * @param {(data: string) => void} update - 回调函数，用于报告进度
     */
    async hello(name, update) {
        for (let i = 0; i < 5; i++) {
            // 调用回调函数报告进度
            update(`progress ${i}`)
            await new Promise((resolve) => setTimeout(resolve, 500))
        }
        return `Hello, ${name}!`
    }

    /**
     * 示例方法：处理二进制数据
     * @param {Uint8Array} buffer - 二进制数据
     */
    async processBuffer(buffer) {
        // 模拟处理过程
        await new Promise((resolve) => setTimeout(resolve, 1000))
        // 返回处理后的数据
        return new Uint8Array(buffer.map(b => b * 2))
    }

    /**
     * 示例方法：实时数据推送
     * @param {(data: object) => void} callback - 数据推送回调
     */
    async subscribeToData(callback) {
        // 模拟实时数据推送
        for (let i = 0; i < 10; i++) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
            callback({
                timestamp: Date.now(),
                value: Math.random(),
                index: i
            })
        }
        return 'Subscription ended'
    }
}

// 创建 API 实例
const extension = new RpcApi()

// 创建 RPC 服务器
createRpcServerWebSocket({
    path: '/rpc',           // RPC 服务路径
    wss: wss,               // WebSocket 服务器实例
    extension: extension,   // 可调用的函数集合
    rpcKey: 'optional-secret-key' // 可选的安全密钥
})

// 启动服务器
server.listen(9000, () => {
    console.log('WebSocket RPC server listening on port 9000')
})
```

### 2. 客户端代码 (client.js)

```js
import { createRpcClientWebSocket } from 'js-rpc2/src/client.js'

// 创建 AbortController 用于控制连接
const ac = new AbortController()

// 创建 RPC 客户端
/** @type{RpcApi} */
const rpc = createRpcClientWebSocket({
    url: 'ws://127.0.0.1:9000/rpc',    // WebSocket RPC 服务地址
    rpcKey: 'optional-secret-key',     // 可选的安全密钥（需与服务端一致）
    signal: ac.signal                  // 用于控制连接的信号
})

// 使用示例
async function example() {
    try {
        // 调用带回调的异步函数
        console.log('Calling hello with progress updates...')
        const result = await rpc.hello('WebSocket User', (progress) => {
            console.log('Progress update:', progress)
        })
        console.log('Hello result:', result)

        // 调用处理二进制数据的函数
        console.log('Processing binary data...')
        const buffer = new Uint8Array([1, 2, 3, 4, 5])
        const processedBuffer = await rpc.processBuffer(buffer)
        console.log('Processed buffer:', processedBuffer)

        // 订阅实时数据
        console.log('Subscribing to real-time data...')
        const subscriptionResult = await rpc.subscribeToData((data) => {
            console.log('Real-time data:', data)
        })
        console.log('Subscription result:', subscriptionResult)

    } catch (error) {
        console.error('RPC call failed:', error)
    }
}

// 执行示例
example()

// 在需要时断开连接
// ac.abort()
```

## API 说明

### 服务器端 API

#### createRpcServerWebSocket

创建 WebSocket RPC 服务器。

```js
/**
 * @param {{
 * path: string; 
 * wss: WebSocketServer; 
 * rpcKey:string;
 * extension: {asyncLocalStorage:AsyncLocalStorage<IncomingMessage>;}; 
 * logger?:(msg:string)=>void;
 * }} param
 */
export function createRpcServerWebSocket(param)
```

参数说明：
- `path`: RPC 服务的路径，用于区分不同的服务
- `wss`: WebSocketServer 实例
- `rpcKey`: 可选的安全密钥，用于验证客户端连接
- `extension`: 包含可远程调用函数的对象
- `logger`: 可选的日志函数

### 客户端 API

#### createRpcClientWebSocket

创建 WebSocket RPC 客户端。

```js
/**
 * @param {{
 * url:string;
 * rpcKey:string;
 * signal:AbortSignal;
 * intercept?:(e:Event)=>void;
 * }} param
 */
export function createRpcClientWebSocket(param)
```

参数说明：
- `url`: WebSocket RPC 服务的完整 URL
- `rpcKey`: 可选的安全密钥，需与服务端一致
- `signal`: AbortSignal，用于控制连接的生命周期
- `intercept`: 可选的事件拦截函数

## 特性

1. **双向通信**: WebSocket 提供全双工通信，服务器也可以主动向客户端推送数据
2. **实时性**: 低延迟通信，适用于实时应用
3. **连接保持**: 长连接减少重复握手开销
4. **类型安全**: 通过 JSDoc 注解提供完整的类型支持
5. **异步回调**: 支持在远程调用过程中传递回调函数
6. **二进制数据**: 原生支持 Uint8Array 等二进制数据类型
7. **自动重连**: 客户端具备自动重连机制
8. **错误处理**: 完善的错误处理和传播机制

## 使用场景

1. **实时应用**: 聊天应用、实时游戏、协作编辑等
2. **数据推送**: 实时数据监控、股票价格更新等
3. **频繁交互**: 需要频繁通信的应用，避免 HTTP 请求的开销
4. **长时间连接**: 需要保持连接状态的应用

## 注意事项

1. WebSocket 连接需要正确处理断开和重连逻辑
2. 服务器需要合理管理并发连接数
3. 注意处理网络异常和超时情况
4. 对于大规模部署，考虑使用负载均衡器
5. 安全方面，确保使用 WSS（WebSocket Secure）进行加密传输
6. 在防火墙环境中，确保 WebSocket 端口未被阻止
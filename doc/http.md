# HTTP 使用文档

## 概述

js-rpc 支持通过 HTTP 协议进行 RPC 调用，使用 Koa 框架作为服务器端实现。HTTP 传输适用于 Web 应用、微服务通信等场景。

## 核心组件

### 服务器端

1. [createRpcServerKoaRouter](../src/server.js#L73) - 在 Koa 路由中创建 RPC 服务器
2. [createRpcServerHelper](../src/lib.js#L467) - 创建 RPC 服务器助手（内部使用）

### 客户端

1. [createRpcClientHttp](../src/lib.js#L726) - 创建 HTTP RPC 客户端

## 完整示例

### 1. 服务器端代码 (server.js)

```js
import { createServer } from 'http'
import Koa from 'koa'
import Router from '@koa/router'
import { createRpcServerKoaRouter } from 'js-rpc2/src/server.js'

// 创建 Koa 应用和路由
const app = new Koa()
const router = new Router()

// 应用中间件
app.use(router.routes())
app.use(router.allowedMethods())

// 启动 HTTP 服务器
const server = createServer(app.callback()).listen(9000)
console.log('Server listening on port 9000')

// 定义可远程调用的函数
class RpcApi {
    /**
     * 示例方法：带回调的异步函数
     * @param {string} name - 名称参数
     * @param {(data: string) => void} update - 回调函数，用于报告进度
     */
    async hello(name, update) {
        for (let i = 0; i < 3; i++) {
            // 调用回调函数报告进度
            update(`progress ${i}`)
            await new Promise((resolve) => setTimeout(resolve, 1000))
        }
        return `hello ${name}`
    }

    /**
     * 示例方法：处理二进制数据
     * @param {Uint8Array} buffer - 二进制数据
     */
    async processBuffer(buffer) {
        // 对数据进行处理，例如截取部分数据
        return buffer.slice(0, Math.min(100, buffer.length))
    }

    /**
     * 示例方法：处理复杂对象
     * @param {Object} data - 复杂对象
     */
    async processData(data) {
        return {
            received: data,
            timestamp: new Date().toISOString(),
            processed: true
        }
    }
}

// 创建 API 实例
const extension = new RpcApi()

// 创建 RPC 服务器
createRpcServerKoaRouter({
    path: '/rpc',           // RPC 服务路径
    router: router,         // Koa 路由实例
    extension: extension,   // 可调用的函数集合
    rpcKey: 'optional-secret-key' // 可选的安全密钥
})
```

### 2. 客户端代码 (client.js)

```js
import { createRpcClientHttp } from 'js-rpc2/src/client.js'

// 创建 RPC 客户端
/** @type{RpcApi} */
const rpc = createRpcClientHttp({
    url: 'http://127.0.0.1:9000/rpc',  // RPC 服务地址
    rpcKey: 'optional-secret-key'      // 可选的安全密钥（需与服务端一致）
})

// 使用示例
async function example() {
    try {
        // 调用带回调的异步函数
        const result = await rpc.hello('World', (progress) => {
            console.log('Progress:', progress)
        })
        console.log('Result:', result)

        // 调用处理二进制数据的函数
        const buffer = new Uint8Array([1, 2, 3, 4, 5])
        const processedBuffer = await rpc.processBuffer(buffer)
        console.log('Processed buffer:', processedBuffer)

        // 调用处理复杂对象的函数
        const data = { name: 'test', value: 42 }
        const processedData = await rpc.processData(data)
        console.log('Processed data:', processedData)

    } catch (error) {
        console.error('RPC call failed:', error)
    }
}

// 执行示例
example()
```

## API 说明

### 服务器端 API

#### createRpcServerKoaRouter

在 Koa 路由中创建 RPC 服务器。

```js
/**
 * @param {{
 * path: string; 
 * router: Router<any, {}>; 
 * rpcKey?:string;
 * logger?:(msg:string)=>void;
 * extension: {asyncLocalStorage:AsyncLocalStorage;}; 
 * }} param 
 */
export function createRpcServerKoaRouter(param)
```

参数说明：
- `path`: RPC 服务的路由路径
- `router`: Koa 路由实例
- `rpcKey`: 可选的安全密钥，用于验证客户端请求
- `logger`: 可选的日志函数
- `extension`: 包含可远程调用函数的对象

### 客户端 API

#### createRpcClientHttp

创建 HTTP RPC 客户端。

```js
/**
 * @param {{
 * url:string;
 * rpcKey?:string;
 * signal?:AbortSignal;
 * intercept?:(res:Response)=>void;
 * }} param
 */
export function createRpcClientHttp(param)
```

参数说明：
- `url`: RPC 服务的完整 URL
- `rpcKey`: 可选的安全密钥，需与服务端一致
- `signal`: 可选的 AbortSignal，用于取消请求
- `intercept`: 可选的响应拦截函数

## 特性

1. **跨域支持**: 客户端可以调用不同域上的 RPC 服务
2. **类型安全**: 通过 JSDoc 注解提供完整的类型支持
3. **异步回调**: 支持在远程调用过程中传递回调函数
4. **二进制数据**: 原生支持 Uint8Array 等二进制数据类型
5. **错误处理**: 完善的错误处理和传播机制
6. **安全验证**: 可选的 rpcKey 参数提供基本的安全验证

## 使用场景

1. **Web 应用**: 浏览器前端调用后端服务
2. **微服务**: 服务间通过 HTTP 进行 RPC 调用
3. **混合架构**: 不同技术栈的服务间通信

## 注意事项

1. 确保服务端正确配置 CORS（跨域资源共享）策略
2. 大数据传输可能影响性能，考虑使用流式传输
3. HTTP 是无状态协议，需要通过 rpcKey 或其他机制实现身份验证
4. 服务端需要正确处理 Koa 中间件的顺序
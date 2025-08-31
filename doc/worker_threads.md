# 在 Node.js Worker Threads 中使用 js-rpc

Node.js Worker Threads 是一种在 Node.js 中实现并行处理的机制，js-rpc 提供了在主线程和 Worker 线程之间进行 RPC 调用的能力。

## 概述

js-rpc 在 Node.js Worker Threads 中的使用主要包括两个部分：
1. 在 Worker 线程中创建 RPC 服务器：使用 [createRpcServerNodeJSWorker](../src/lib.js#L993)
2. 在主线程中创建 RPC 客户端：使用 [createRpcClientNodeJSWorker](../src/lib.js#L1013)

## 完整示例

### 1. Worker 线程代码 (worker.js)

```js
// 导入必要的模块
import { parentPort } from 'worker_threads'
import { createRpcServerNodeJSWorker } from 'js-rpc2/src/lib.js'

// 定义可被远程调用的函数
async function readClipboard() {
    // 实现读取剪贴板的逻辑
    // 这里只是示例，实际实现取决于你的需求
    return 'clipboard content'
}

async function writeClipboard(data) {
    // 实现写入剪贴板的逻辑
    console.log('Writing to clipboard:', data)
    return true
}

async function writeClipboardText(text) {
    // 实现写入文本到剪贴板的逻辑
    console.log('Writing text to clipboard:', text)
    return true
}

async function readClipboardText() {
    // 实现读取剪贴板文本的逻辑
    return 'clipboard text'
}

async function readClipboardHtml() {
    // 实现读取剪贴板 HTML 内容的逻辑
    return '<p>clipboard html</p>'
}

async function readClipboardImage() {
    // 实现读取剪贴板图片的逻辑
    return new Uint8Array([1, 2, 3, 4]) // 示例二进制数据
}

// 将所有函数导出为一个 API 对象
export const ExtensionApi = {
    readClipboard,
    writeClipboard,
    writeClipboardText,
    readClipboardText,
    readClipboardHtml,
    readClipboardImage,
}

// 创建 RPC 服务器
createRpcServerNodeJSWorker({ 
    parentPort, 
    extension: ExtensionApi,
    logger: (msg) => console.log('[Worker]', msg) // 可选的日志记录器
})
```

### 2. 主线程代码 (main.js)

```js
// 导入必要的模块
import { createRpcClientNodeJSWorker } from 'js-rpc2/src/lib.js'
import { Worker } from 'worker_threads'

// 创建 Worker 实例
export const worker = new Worker(new URL('./worker.js', import.meta.url))

// 创建 RPC 客户端
/** @type{ExtensionApi} */
const rpc = createRpcClientNodeJSWorker({ worker: worker })

// 取消 Worker 的引用，允许程序在没有其他任务时退出
worker.unref()

// 包装远程调用函数
export async function readClipboard() {
    return await rpc.readClipboard()
}

/**
 * 写入剪贴板内容
 * @param {'text'|'richtext'|'image'} type - 数据类型
 * @param {string|Buffer} data - 要写入的数据
 */
export async function writeClipboard(type, data) {
    return await rpc.writeClipboard(type, data)
}

/**
 * 写入文本到剪贴板
 * @param {string} text - 要写入的文本
 */
export async function writeClipboardText(text) {
    return rpc.writeClipboardText(text)
}

export async function readClipboardText() {
    return rpc.readClipboardText()
}

export async function readClipboardHtml() {
    return rpc.readClipboardHtml()
}

export async function readClipboardImage() {
    return rpc.readClipboardImage()
}

// 使用示例
async function example() {
    // 调用远程函数
    const text = await readClipboardText()
    console.log('Clipboard text:', text)
    
    await writeClipboardText('Hello from main thread!')
    
    const image = await readClipboardImage()
    console.log('Clipboard image size:', image.length)
}
```

## API 说明

### createRpcServerNodeJSWorker

在 Worker 线程中创建 RPC 服务器。

```js
/**
 * @param {{
 * parentPort: NodeJSMessagePort;
 * extension: Object;
 * logger?:(msg:string)=>void;
 * }} param 
 */
export function createRpcServerNodeJSWorker(param)
```

参数说明：
- `parentPort`: Worker 线程的 parentPort 对象，用于与主线程通信
- `extension`: 包含可被远程调用函数的对象
- `logger`: 可选的日志记录函数

### createRpcClientNodeJSWorker

在主线程中创建 RPC 客户端。

```js
/**
 * @param {{
 * worker:NodeJSWorker;
 * }} param
 */
export function createRpcClientNodeJSWorker(param)
```

参数说明：
- `worker`: Worker 实例

## 特性

1. **透明的远程调用**：在主线程中调用 Worker 中的函数就像调用本地函数一样简单
2. **支持异步函数**：所有远程函数都可以是异步的
3. **参数和返回值序列化**：自动处理参数和返回值的序列化/反序列化
4. **类型安全**：通过 JSDoc 注解提供完整的类型支持
5. **错误处理**：远程函数抛出的错误会正确传播到调用方

## 注意事项

1. 确保 Worker 线程中的函数是可序列化的
2. 大数据传输可能影响性能，考虑使用流式传输
3. 避免在远程函数中使用闭包引用 Worker 外部的变量
4. Worker 线程在没有任务时会自动退出，如需保持运行请适当管理引用
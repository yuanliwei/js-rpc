# 其他环境使用文档

## 概述

js-rpc 除了支持 Node.js Worker Threads、HTTP 和 WebSocket 外，还支持多种其他环境，包括 Electron、Chrome 扩展和 MessagePort 等。这些环境都基于消息传递机制实现 RPC 调用。

## 支持的环境

### 1. Electron

Electron 环境中可以使用 MessagePort 进行主进程和渲染进程之间的通信。

#### 服务器端 API

- [createRpcServerElectronMessagePort](../src/lib.js#L796)

#### 客户端 API

暂无专用客户端，可使用通用 MessagePort 客户端。

### 2. Chrome 扩展

Chrome 扩展中可以使用 chrome.runtime API 进行不同组件之间的通信。

#### 服务器端 API

- [createRpcServerChromeExtensions](../src/lib.js#L868)

#### 客户端 API

- [createRpcClientChromeExtensions](../src/lib.js#L929)

### 3. MessagePort

通用 MessagePort 环境，如 Web Workers 或其他支持 MessagePort API 的环境。

#### 服务器端 API

- [createRpcServerMessagePort](../src/lib.js#L760)

#### 客户端 API

- [createRpcClientMessagePort](../src/lib.js#L819)

## 完整示例

### 1. Electron 示例

#### 主进程代码 (main.js)

```js
import { app, BrowserWindow, ipcRenderer } from 'electron'
import { createRpcServerElectronMessagePort } from 'js-rpc2/src/lib.js'

// 主进程服务函数
class MainProcessApi {
    /**
     * 获取系统信息
     */
    async getSystemInfo() {
        return {
            platform: process.platform,
            arch: process.arch,
            version: process.version,
            uptime: process.uptime()
        }
    }

    /**
     * 执行计算密集型任务
     * @param {number} n - 计算参数
     */
    async computeIntensiveTask(n) {
        let result = 0
        for (let i = 0; i < n; i++) {
            result += Math.sin(i) * Math.cos(i)
        }
        return result
    }
}

// 创建窗口时建立 RPC 连接
app.whenReady().then(() => {
    const mainWindow = new BrowserWindow({
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    })

    // 当需要建立 RPC 连接时
    mainWindow.webContents.once('did-finish-load', () => {
        // 创建 MessagePort 通道
        const { port1, port2 } = new MessageChannelMain()
        
        // 在主进程端创建 RPC 服务器
        createRpcServerElectronMessagePort({
            port: port1,
            extension: new MainProcessApi()
        })
        
        // 将 port2 发送到渲染进程
        mainWindow.webContents.postMessage('rpc-port', null, [port2])
    })

    mainWindow.loadFile('index.html')
})
```

#### 渲染进程代码 (renderer.js)

```js
import { createRpcClientMessagePort } from 'js-rpc2/src/lib.js'

// 等待主进程发送 MessagePort
window.addEventListener('message', async (event) => {
    if (event.data === 'rpc-port' && event.ports.length > 0) {
        const port = event.ports[0]
        
        // 创建 RPC 客户端
        /** @type{MainProcessApi} */
        const rpc = createRpcClientMessagePort({
            port: port
        })
        
        // 使用 RPC 调用主进程函数
        try {
            const systemInfo = await rpc.getSystemInfo()
            console.log('System info:', systemInfo)
            
            const result = await rpc.computeIntensiveTask(1000000)
            console.log('Computation result:', result)
        } catch (error) {
            console.error('RPC call failed:', error)
        }
    }
})
```

### 2. Chrome 扩展示例

#### Background 脚本 (background.js)

```js
import { createRpcServerChromeExtensions } from 'js-rpc2/src/lib.js'

// Background 脚本服务函数
class BackgroundApi {
    /**
     * 获取浏览器标签页信息
     */
    async getTabsInfo() {
        const tabs = await chrome.tabs.query({})
        return tabs.map(tab => ({
            id: tab.id,
            title: tab.title,
            url: tab.url,
            active: tab.active
        }))
    }

    /**
     * 创建新标签页
     * @param {string} url - 标签页 URL
     */
    async createTab(url) {
        const tab = await chrome.tabs.create({ url })
        return {
            id: tab.id,
            url: tab.url
        }
    }

    /**
     * 带回调的长时间运行任务
     * @param {(progress: string) => void} callback - 进度回调
     */
    async longRunningTask(callback) {
        for (let i = 1; i <= 10; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000))
            callback(`Step ${i} completed`)
        }
        return 'Task finished'
    }
}

// 创建 RPC 服务器
createRpcServerChromeExtensions({
    chrome: chrome,
    key: 'background-rpc',
    extension: new BackgroundApi()
})
```

#### Popup 脚本 (popup.js)

```js
import { createRpcClientChromeExtensions } from 'js-rpc2/src/lib.js'

// 创建 RPC 客户端
const rpc = createRpcClientChromeExtensions({
    chrome: chrome,
    key: 'background-rpc'
})

// DOM 元素
const tabsList = document.getElementById('tabs-list')
const urlInput = document.getElementById('url-input')
const createTabButton = document.getElementById('create-tab-button')
const progressDiv = document.getElementById('progress')

// 获取标签页信息
async function getTabsInfo() {
    try {
        const tabsInfo = await rpc.getTabsInfo()
        tabsList.innerHTML = tabsInfo.map(tab => 
            `<div class="tab-item ${tab.active ? 'active' : ''}">
                <strong>${tab.title}</strong><br>
                ${tab.url}
            </div>`
        ).join('')
    } catch (error) {
        console.error('Failed to get tabs info:', error)
    }
}

// 创建新标签页
async function createTab() {
    const url = urlInput.value
    if (!url) return
    
    try {
        const result = await rpc.createTab(url)
        console.log('Created tab:', result)
        urlInput.value = ''
        getTabsInfo() // 刷新标签页列表
    } catch (error) {
        console.error('Failed to create tab:', error)
    }
}

// 执行长时间运行任务
async function runLongTask() {
    try {
        const result = await rpc.longRunningTask((progress) => {
            progressDiv.textContent = progress
        })
        progressDiv.textContent = result
    } catch (error) {
        console.error('Task failed:', error)
        progressDiv.textContent = 'Task failed'
    }
}

// 绑定事件
createTabButton.addEventListener('click', createTab)
document.getElementById('refresh-button').addEventListener('click', getTabsInfo)
document.getElementById('run-task-button').addEventListener('click', runLongTask)

// 初始化
getTabsInfo()
```

### 3. Web Worker 示例

#### 主线程代码 (main.js)

```js
import { createRpcClientMessagePort } from 'js-rpc2/src/lib.js'

// 创建 Web Worker
const worker = new Worker('./worker.js')

// 创建 RPC 客户端
/** @type{WorkerApi} */
const rpc = createRpcClientMessagePort({
    port: worker
})

// 使用示例
async function example() {
    try {
        // 调用 Worker 中的函数
        const result = await rpc.calculateFibonacci(40)
        console.log('Fibonacci result:', result)
        
        // 调用带进度更新的函数
        const processDataResult = await rpc.processDataWithProgress(10000, (progress) => {
            console.log(`Processing: ${progress}%`)
        })
        console.log('Process data result:', processDataResult)
        
    } catch (error) {
        console.error('RPC call failed:', error)
    }
}

example()
```

#### Worker 线程代码 (worker.js)

```js
import { createRpcServerMessagePort } from 'js-rpc2/src/lib.js'

// Worker 中的服务函数
class WorkerApi {
    /**
     * 计算斐波那契数
     * @param {number} n - 数列位置
     */
    async calculateFibonacci(n) {
        if (n <= 1) return n
        let a = 0, b = 1
        for (let i = 2; i <= n; i++) {
            const temp = a + b
            a = b
            b = temp
        }
        return b
    }
    
    /**
     * 带进度更新的数据处理
     * @param {number} dataSize - 数据大小
     * @param {(progress: number) => void} progressCallback - 进度回调
     */
    async processDataWithProgress(dataSize, progressCallback) {
        const data = new Array(dataSize).fill(0).map(() => Math.random())
        
        let processed = 0
        const step = Math.max(1, Math.floor(dataSize / 100)) // 每1%报告一次进度
        
        for (let i = 0; i < dataSize; i++) {
            // 模拟处理过程
            data[i] = Math.pow(data[i], 2) + Math.sqrt(data[i])
            
            processed++
            if (processed % step === 0 || processed === dataSize) {
                const progress = Math.round((processed / dataSize) * 100)
                progressCallback(progress)
            }
        }
        
        return {
            processedItems: processed,
            average: data.reduce((sum, val) => sum + val, 0) / dataSize
        }
    }
}

// 创建 RPC 服务器
createRpcServerMessagePort({
    port: self,
    extension: new WorkerApi()
})
```

## API 说明

### Electron

#### createRpcServerElectronMessagePort

在 Electron 主进程中创建 RPC 服务器。

```js
/**
 * @param {{
 * port:Electron.MessagePortMain;
 * rpcKey:string;
 * extension: object; 
 * logger?:(msg:string)=>void;
 * }} param 
 */
export function createRpcServerElectronMessagePort(param)
```

### Chrome 扩展

#### createRpcServerChromeExtensions

在 Chrome 扩展中创建 RPC 服务器。

```js
/**
 * @param {{
 * chrome:Chrome;
 * key: string;
 * extension: ExtensionApi<Chrome.runtime.MessageSender>
 * logger?:(msg:string)=>void;
 * }} param 
 */
export function createRpcServerChromeExtensions(param)
```

#### createRpcClientChromeExtensions

在 Chrome 扩展中创建 RPC 客户端。

```js
/**
 * @param {{ 
 * chrome:Chrome;
 * key:string;
 * tabId?: number;
 * }} param
 */
export function createRpcClientChromeExtensions(param)
```

### MessagePort

#### createRpcServerMessagePort

在任意支持 MessagePort 的环境中创建 RPC 服务器。

```js
/**
 * @param {{
 * port:MessagePort;
 * rpcKey:string;
 * extension: object;
 * logger?:(msg:string)=>void;
 * }} param 
 */
export function createRpcServerMessagePort(param)
```

#### createRpcClientMessagePort

在任意支持 MessagePort 的环境中创建 RPC 客户端。

```js
/**
 * @param {{
 * port:MessagePort;
 * rpcKey:string;
 * }} param
 */
export function createRpcClientMessagePort(param)
```

## 特性

1. **跨环境兼容**: 支持多种基于消息传递的环境
2. **类型安全**: 通过 JSDoc 注解提供完整的类型支持
3. **异步回调**: 支持在远程调用过程中传递回调函数
4. **二进制数据**: 原生支持 Uint8Array 等二进制数据类型
5. **错误处理**: 完善的错误处理和传播机制
6. **灵活部署**: 可根据不同环境特点灵活部署

## 使用场景

1. **Electron 应用**: 主进程与渲染进程通信
2. **Chrome 扩展**: 不同组件间通信（popup、content scripts、background）
3. **Web Workers**: 主线程与 Worker 线程通信
4. **Shared Workers**: 多页面共享 Worker
5. **iframe 通信**: 不同源页面间通信

## 注意事项

1. 不同环境的 MessagePort 实现可能略有差异
2. Chrome 扩展需要正确配置 manifest 权限
3. Electron 环境需要正确设置 webPreferences
4. 注意处理跨域和安全限制
5. 合理管理 MessagePort 的生命周期
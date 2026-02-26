# Electron RPC 通信使用说明

## 概述

本文档介绍如何在 Electron 应用中使用 `js-rpc2` 库实现主进程与渲染进程之间的 RPC 通信。通过 MessagePort 机制，实现跨进程的远程方法调用。

## 项目结构

### 组件说明

- **main.js**: Electron 主进程，提供核心服务接口
- **preload.js**: 预加载脚本，建立主进程与渲染进程的通信桥梁
- **renderer.js**: 渲染进程，运行在浏览器环境中
- **usage.js**: 使用示例，展示如何调用 RPC 方法

## 核心实现

### 主进程 (main.js)

```javascript
import { ipcMain } from 'electron'
import { createRpcServerElectronMessagePort } from 'js-rpc2/src/lib.js'

class AppApi {
    asyncLocalStorage = new AsyncLocalStorage()

    async hello(param) {
        return 'wertyuioiuytre ' + param
    }
}

// 监听来自渲染进程的 port 消息
ipcMain.on('port', (event) => {
    const port = event.ports[0]
    // 创建 RPC 服务端点
    createRpcServerElectronMessagePort({ 
        port, 
        rpcKey: '', 
        extension: new AppApi() 
    })
    port.start()
})
```

### 预加载脚本 (preload.js)

```javascript
import { ipcRenderer } from 'electron/renderer'

// 监听来自渲染进程的消息
window.onmessage = (/** @type {MessageEvent} */ event) => {
    // 验证消息来源并转发给主进程
    if (event.isTrusted && event.data == 'port') {
        ipcRenderer.postMessage('port', null, [event.ports[0]])
    }
}
```

### 渲染进程 (renderer.js)

```javascript
import { createRpcClientMessagePort } from 'js-rpc2/src/lib.js'

// 创建消息通道
const channel = new MessageChannel();

// 向主进程发送端口
window.postMessage("port", location.origin, [channel.port1]);

// 创建 RPC 客户端
let rpc = createRpcClientMessagePort({ 
    port: channel.port2, 
    rpcKey: "" 
});
```

### 使用示例 (usage.js)

```javascript
async function postPortMessage() {
    // 调用远程方法
    let ret = await rpc.hello('6667');
    console.info("ret from rpc:", ret);
}
```

## 通信流程

1. 渲染进程创建 `MessageChannel` 并通过 `postMessage` 将 `port1` 发送到预加载脚本
2. 预加载脚本验证消息来源并将端口转发给主进程
3. 主进程接收端口并创建 RPC 服务端点
4. 渲染进程使用 `port2` 创建 RPC 客户端
5. 客户端可以调用主进程中定义的服务方法

## 使用方法

### 1. 主进程设置

在主进程中定义服务类并创建 RPC 服务：

```javascript
class AppApi {
    async yourMethod(params) {
        // 实现业务逻辑
        return result;
    }
}

ipcMain.on('port', (event) => {
    const port = event.ports[0]
    createRpcServerElectronMessagePort({ 
        port, 
        rpcKey: '', 
        extension: new AppApi() 
    })
    port.start()
})
```

### 2. 渲染进程调用

在渲染进程中建立连接并调用远程方法：

```javascript
const channel = new MessageChannel();
window.postMessage("port", location.origin, [channel.port1]);
let rpc = createRpcClientMessagePort({ port: channel.port2, rpcKey: "" });

// 调用远程方法
let result = await rpc.yourMethod(params);
```

## 注意事项

- 确保在 Electron 的安全策略下正确配置 `contextIsolation` 和 `sandbox` 选项
- 预加载脚本中的消息验证是安全通信的关键
- MessagePort 需要在两端都启动后才能正常通信
- 异步方法调用需要正确处理 Promise 返回值
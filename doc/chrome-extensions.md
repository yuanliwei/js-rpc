# Chrome Extensions RPC 通信使用说明

## 概述

本项目使用 `js-rpc2` 库实现在 Chrome 扩展各组件间的远程过程调用（RPC）通信，支持在 popup、content scripts 和 background 之间进行双向通信。

## 项目结构

### 组件说明

- **background.js**: 后台脚本，提供核心服务接口
- **content_scripts.js**: 内容脚本，运行在网页上下文中，可作为通信中继
- **popup.js**: 扩展弹窗界面，用户交互入口

## 核心实现

### Background 脚本

```javascript
import {createRpcServerChromeExtensions} from 'js-rpc2/src/lib.js'

export class RpcBackgroundApi {
    /**
     * 带回调的示例方法
     * @param {(progress: string, date: Date) => Promise<void>} cb - 回调函数
     */
    async callback(cb) {
        for (let i = 0; i < 10; i++) {
            await sleep(1000)
            await cb(`from background index is ${i}`, new Date())
        }
        return 'over!'
    }
}

// 创建RPC服务端点
createRpcServerChromeExtensions({ 
    chrome, 
    key: 'rpc-popup->background', 
    extension: new RpcBackgroundApi()
})

createRpcServerChromeExtensions({ 
    chrome, 
    key: 'rpc-content-scripts->background', 
    extension: new RpcBackgroundApi()
})
```

### Content Scripts 脚本

```javascript
import {createRpcServerChromeExtensions, createRpcClientChromeExtensions} from 'js-rpc2/src/lib.js'

export class RpcContentScriptsApi {
    async callBackgroundWithCallback(name, callback) {
        return await rpcContentScriptBackground.callback(callback)
    }
}

// 创建RPC服务端点供popup调用
createRpcServerChromeExtensions({
    chrome, 
    key: 'rpc-popup->content-script', 
    extension: new RpcContentScriptsApi()
})

// 创建RPC客户端连接到background
export const rpcContentScriptBackground = createRpcClientChromeExtensions({
    chrome, 
    key: 'rpc-content-scripts->background'
})
```

### Popup 脚本

```javascript
import {createRpcClientChromeExtensions} from 'js-rpc2/src/lib.js'

// 获取当前活动标签页
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

// 创建RPC客户端
export const rpcPopupContentScripts = createRpcClientChromeExtensions({
    chrome, 
    key: 'rpc-popup->content-script', 
    tabId: tab.id
})

export const rpcPopupBackground = createRpcClientChromeExtensions({
    chrome, 
    key: 'rpc-popup->background'
})

// 使用示例
let resp = await rpcPopupContentScripts.callBackgroundWithCallback("name", async (progress, date) => {
    console.info('at popup callback', progress, date)
})
console.info("over!", resp)

let resp2 = await rpcPopupBackground.callback(async (progress, date) => {
    console.info('at popup callback', progress, date)
})
console.info("over!", resp2)
```

## 通信模式

### 直接通信
Popup → Background
```javascript
rpcPopupBackground.callback(callbackFunction)
```

### 间接通信
Popup → Content Script → Background
```javascript
rpcPopupContentScripts.callBackgroundWithCallback(name, callbackFunction)
```

## 使用方法

1. 在各组件中导入相应的 RPC 创建函数
2. 定义服务接口类
3. 使用 `createRpcServerChromeExtensions` 创建服务端点
4. 使用 `createRpcClientChromeExtensions` 创建客户端连接
5. 通过客户端实例调用远程方法

## 注意事项

- 确保 manifest.json 中正确配置了各组件的权限和通信策略
- 注意处理异步回调的生命周期管理
- 建议为所有 RPC 接口添加适当的错误处理机制
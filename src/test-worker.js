import { parentPort } from 'node:worker_threads'
import { createRpcServerWorker } from './lib.js'

export const ExtensionApi = {
    /**
     * @param {any} name
     */
    async hello(name) {
        return `hello ${name}`
    }
}

createRpcServerWorker({ parentPort, extension: ExtensionApi, })

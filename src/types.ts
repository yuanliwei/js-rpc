import { AsyncLocalStorage } from "node:async_hooks";

export type ExtensionApi<T> = { asyncLocalStorage: AsyncLocalStorage<T> } & object;


export type RPC_TYPE_CALL = 0xdf68f4cb
export type RPC_TYPE_RETURN = 0x68b17581
export type RPC_TYPE_CALLBACK = 0x8d65e5cc
export type RPC_TYPE_ERROR = 0xa07c0f84

export type RPC_DATA_ARG_TYPE_OTHERS = 0xa7f68c
export type RPC_DATA_ARG_TYPE_FUNCTION = 0x7ff45f


export type RPC_TYPES = RPC_TYPE_CALL |
    RPC_TYPE_RETURN |
    RPC_TYPE_CALLBACK |
    RPC_TYPE_ERROR;


export type PromiseResolvers = {
    promise: Promise<any>;
    resolve: (value: any | null) => void;
    reject: (reason: any | null) => void;
};

export type CALLBACK_ITEM = {
    id: number;
    type: RPC_TYPES;
    promise?: PromiseResolvers;
    callback?: (...data: object[]) => void;
};

export type RPC_DATA_ARG_ITEM = { type: RPC_DATA_ARG_TYPE; data: object; };
export type RPC_DATA = {
    id: number;
    type: RPC_TYPE_CALL | RPC_TYPE_CALLBACK;
    data: { type: RPC_DATA_ARG_TYPE; data: any; }[];
} | {
    id: number;
    type: RPC_TYPE_RETURN;
    data: any;
} | {
    id: number;
    type: RPC_TYPE_ERROR;
    data: { message: string, stack: string };
};

export type RPC_DATA_ARG_TYPE = RPC_DATA_ARG_TYPE_OTHERS | RPC_DATA_ARG_TYPE_FUNCTION;

export declare namespace Electron {

    const NodeEventEmitter: typeof import('events').EventEmitter;

    class MessagePortMain extends NodeEventEmitter {

        // Docs: https://electronjs.org/docs/api/message-port-main

        /**
         * Emitted when the remote end of a MessagePortMain object becomes disconnected.
         */
        on(event: 'close', listener: () => void): this;
        off(event: 'close', listener: () => void): this;
        once(event: 'close', listener: () => void): this;
        addListener(event: 'close', listener: () => void): this;
        removeListener(event: 'close', listener: () => void): this;
        /**
         * Emitted when a MessagePortMain object receives a message.
         */
        on(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
        off(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
        once(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
        addListener(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
        removeListener(event: 'message', listener: (messageEvent: MessageEvent) => void): this;
        /**
         * Disconnects the port, so it is no longer active.
         */
        close(): void;
        /**
         * Sends a message from the port, and optionally, transfers ownership of objects to
         * other browsing contexts.
         */
        postMessage(message: any, transfer?: MessagePortMain[]): void;
        /**
         * Starts the sending of messages queued on the port. Messages will be queued until
         * this method is called.
         */
        start(): void;
    }

}
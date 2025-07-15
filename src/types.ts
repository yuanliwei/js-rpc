import { AsyncLocalStorage } from "node:async_hooks";

export type ExtensionApi<T> = { asyncLocalStorage: AsyncLocalStorage<T> } & object;

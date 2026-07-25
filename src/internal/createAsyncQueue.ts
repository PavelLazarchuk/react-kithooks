import { createListenerSet } from './listenerSet';

export type AsyncQueueStatus = 'idle' | 'running';

export interface AsyncQueueSnapshot {
    status: AsyncQueueStatus;
    pending: number;
}

export interface AsyncQueue {
    enqueue: <T>(task: () => Promise<T>) => Promise<T>;
    getSnapshot: () => AsyncQueueSnapshot;
    subscribe: (listener: () => void) => () => void;
    isDisposable: () => boolean;
}

export interface CreateAsyncQueueOptions {
    onDisposable?: () => void;
}

const IDLE: AsyncQueueSnapshot = { status: 'idle', pending: 0 };

/**
 * Promise-chain mutex with a reactive snapshot: tasks run one at a time, in
 * enqueue order, each starting only once the previous one has settled.
 */
export function createAsyncQueue(options: CreateAsyncQueueOptions = {}): AsyncQueue {
    let tail: Promise<unknown> = Promise.resolve();
    let pending = 0;
    let snapshot: AsyncQueueSnapshot = IDLE;
    const listeners = createListenerSet();

    const isDisposable = () => pending === 0 && listeners.size === 0;

    const reportDisposable = () => {
        if (isDisposable()) options.onDisposable?.();
    };

    const publish = () => {
        snapshot = pending === 0 ? IDLE : { status: 'running', pending };
        listeners.notify();
        reportDisposable();
    };

    const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
        pending += 1;
        publish();

        const result = tail.then(task);

        tail = result.catch(() => undefined);

        const settle = () => {
            pending -= 1;
            publish();
        };

        result.then(settle, settle);

        return result;
    };

    const subscribe = (listener: () => void): (() => void) => {
        const unsubscribe = listeners.add(listener);

        return () => {
            unsubscribe();
            reportDisposable();
        };
    };

    return {
        enqueue,
        getSnapshot: () => snapshot,
        subscribe,
        isDisposable,
    };
}

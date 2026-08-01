import { createListenerSet } from './listenerSet';

export type AsyncQueueStatus = 'idle' | 'running';

export interface AsyncQueueSnapshot {
    status: AsyncQueueStatus;
    pending: number;
    running: number;
    queued: number;
}

export interface AsyncQueue {
    enqueue: <T>(task: () => Promise<T>) => Promise<T>;
    getSnapshot: () => AsyncQueueSnapshot;
    subscribe: (listener: () => void) => () => void;
    isDisposable: () => boolean;
    clear: () => number;
    setConcurrency: (next: number) => void;
}

export interface CreateAsyncQueueOptions {
    onDisposable?: () => void;
    concurrency?: number;
}

export class AsyncQueueClearedError extends Error {
    constructor() {
        super('Task was cleared from the queue before it started.');
        this.name = 'AsyncQueueClearedError';
    }
}

interface QueueItem {
    start: () => void;
    drop: () => void;
    promise: Promise<unknown>;
}

const IDLE: AsyncQueueSnapshot = { status: 'idle', pending: 0, running: 0, queued: 0 };

function normalizeConcurrency(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value)) return 1;

    return Math.max(1, Math.floor(value));
}

export function createAsyncQueue(options: CreateAsyncQueueOptions = {}): AsyncQueue {
    let concurrency = normalizeConcurrency(options.concurrency);
    let running = 0;
    const queue: QueueItem[] = [];
    let snapshot: AsyncQueueSnapshot = IDLE;
    const listeners = createListenerSet();

    const isDisposable = () => running === 0 && queue.length === 0 && listeners.size === 0;

    const reportDisposable = () => {
        if (isDisposable()) options.onDisposable?.();
    };

    const publish = () => {
        snapshot =
            running === 0 && queue.length === 0
                ? IDLE
                : {
                      status: 'running',
                      pending: running + queue.length,
                      running,
                      queued: queue.length,
                  };
        listeners.notify();
        reportDisposable();
    };

    const pump = () => {
        while (running < concurrency && queue.length > 0) {
            const item = queue.shift();

            if (item) item.start();
        }

        publish();
    };

    const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
        let item!: Omit<QueueItem, 'promise'>;

        const promise = new Promise<T>((resolve, reject) => {
            item = {
                start: () => {
                    running += 1;

                    Promise.resolve()
                        .then(task)
                        .then(resolve, reject)
                        .finally(() => {
                            running -= 1;
                            pump();
                        });
                },
                drop: () => reject(new AsyncQueueClearedError()),
            };
        });

        queue.push({ ...item, promise });
        pump();

        return promise;
    };

    const clear = (): number => {
        const dropped = queue.splice(0, queue.length);

        for (const item of dropped) {
            item.promise.catch(() => undefined);
            item.drop();
        }

        publish();

        return dropped.length;
    };

    const setConcurrency = (next: number) => {
        const normalized = normalizeConcurrency(next);

        if (normalized === concurrency) return;

        concurrency = normalized;
        pump();
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
        clear,
        setConcurrency,
    };
}

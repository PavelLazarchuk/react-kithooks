import { createListenerSet } from './listenerSet';

export type AsyncQueueStatus = 'idle' | 'running' | 'paused';

export interface AsyncQueueSnapshot {
    status: AsyncQueueStatus;
    pending: number;
    running: number;
    queued: number;
    isPaused: boolean;
}

export interface EnqueueOptions {
    priority?: number;
    key?: string;
    replace?: boolean;
}

export interface AsyncQueue {
    enqueue: <T>(task: () => Promise<T>, options?: EnqueueOptions) => Promise<T>;
    getSnapshot: () => AsyncQueueSnapshot;
    subscribe: (listener: () => void) => () => void;
    isDisposable: () => boolean;
    idle: () => Promise<void>;
    clear: () => number;
    cancel: (key: string) => number;
    pause: () => void;
    resume: () => void;
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

export class AsyncQueueReplacedError extends Error {
    constructor(key: string) {
        super(`Task was replaced by a newer task with key "${key}" before it started.`);
        this.name = 'AsyncQueueReplacedError';
    }
}

interface QueueItem {
    start: () => void;
    drop: (error: Error) => void;
    promise: Promise<unknown>;
    priority: number;
    key: string | undefined;
}

const IDLE: AsyncQueueSnapshot = {
    status: 'idle',
    pending: 0,
    running: 0,
    queued: 0,
    isPaused: false,
};

function normalizeConcurrency(value: number | undefined): number {
    if (value === undefined || !Number.isFinite(value)) return 1;

    return Math.max(1, Math.floor(value));
}

function normalizePriority(value: number | undefined): number {
    if (value === undefined || Number.isNaN(value)) return 0;

    return value;
}

export function isAsyncQueueCancellation(error: unknown): boolean {
    return error instanceof AsyncQueueClearedError || error instanceof AsyncQueueReplacedError;
}

export function createAsyncQueue(options: CreateAsyncQueueOptions = {}): AsyncQueue {
    let concurrency = normalizeConcurrency(options.concurrency);
    let running = 0;
    let paused = false;
    const queue: QueueItem[] = [];
    const runningKeys = new Set<string>();
    let snapshot: AsyncQueueSnapshot = IDLE;
    const listeners = createListenerSet();

    const idleWaiters: Array<() => void> = [];

    const isDrained = () => running === 0 && queue.length === 0;

    const isDisposable = () => isDrained() && listeners.size === 0 && !paused;

    const reportDisposable = () => {
        if (isDisposable()) options.onDisposable?.();
    };

    const status = (): AsyncQueueStatus => {
        if (running > 0) return 'running';
        if (paused) return 'paused';

        return queue.length > 0 ? 'running' : 'idle';
    };

    const resolveIdleWaiters = () => {
        if (!isDrained() || idleWaiters.length === 0) return;

        for (const resolve of idleWaiters.splice(0, idleWaiters.length)) resolve();
    };

    const publish = () => {
        snapshot =
            isDrained() && !paused
                ? IDLE
                : {
                      status: status(),
                      pending: running + queue.length,
                      running,
                      queued: queue.length,
                      isPaused: paused,
                  };
        listeners.notify();
        resolveIdleWaiters();
        reportDisposable();
    };

    const idle = (): Promise<void> => {
        if (isDrained()) return Promise.resolve();

        return new Promise<void>(resolve => {
            idleWaiters.push(resolve);
        });
    };

    const nextRunnableIndex = (): number => {
        for (let i = 0; i < queue.length; i += 1) {
            const item = queue[i];

            if (item && (item.key === undefined || !runningKeys.has(item.key))) return i;
        }

        return -1;
    };

    const pump = () => {
        while (!paused && running < concurrency) {
            const index = nextRunnableIndex();

            if (index === -1) break;

            const [item] = queue.splice(index, 1);

            if (item) item.start();
        }

        publish();
    };

    const drop = (
        matches: (item: QueueItem) => boolean,
        toError: (item: QueueItem) => Error
    ): QueueItem[] => {
        const dropped: QueueItem[] = [];

        for (let i = queue.length - 1; i >= 0; i -= 1) {
            const item = queue[i];

            if (!item || !matches(item)) continue;

            queue.splice(i, 1);
            dropped.push(item);
        }

        for (const item of dropped) {
            item.promise.catch(() => undefined);
            item.drop(toError(item));
        }

        return dropped;
    };

    const insert = (item: QueueItem) => {
        let index = queue.length;

        while (index > 0) {
            const ahead = queue[index - 1];

            if (!ahead || ahead.priority >= item.priority) break;

            index -= 1;
        }

        queue.splice(index, 0, item);
    };

    const enqueue = <T>(task: () => Promise<T>, taskOptions: EnqueueOptions = {}): Promise<T> => {
        const key = taskOptions.key;
        let item!: Omit<QueueItem, 'promise'>;

        const promise = new Promise<T>((resolve, reject) => {
            item = {
                start: () => {
                    running += 1;
                    if (key !== undefined) runningKeys.add(key);

                    Promise.resolve()
                        .then(task)
                        .then(resolve, reject)
                        .finally(() => {
                            running -= 1;
                            if (key !== undefined) runningKeys.delete(key);
                            pump();
                        });
                },
                drop: error => reject(error),
                priority: normalizePriority(taskOptions.priority),
                key,
            };
        });

        if (key !== undefined && taskOptions.replace) {
            drop(
                queued => queued.key === key,
                () => new AsyncQueueReplacedError(key)
            );
        }

        insert({ ...item, promise });
        pump();

        return promise;
    };

    const dropAndPublish = (matches: (item: QueueItem) => boolean): number => {
        const dropped = drop(matches, () => new AsyncQueueClearedError());

        if (dropped.length > 0) publish();

        return dropped.length;
    };

    const clear = (): number => dropAndPublish(() => true);

    const cancel = (key: string): number => dropAndPublish(item => item.key === key);

    const pause = () => {
        if (paused) return;

        paused = true;
        publish();
    };

    const resume = () => {
        if (!paused) return;

        paused = false;
        pump();
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
        idle,
        clear,
        cancel,
        pause,
        resume,
        setConcurrency,
    };
}

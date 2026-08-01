import {
    createContext,
    createElement,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';

import {
    AsyncQueueClearedError,
    AsyncQueueReplacedError,
    createAsyncQueue,
    isAsyncQueueCancellation,
} from '../internal/createAsyncQueue';
import type { AsyncQueue, AsyncQueueStatus, EnqueueOptions } from '../internal/createAsyncQueue';
import { getAsyncQueue } from './store';

export type { AsyncQueueStatus, EnqueueOptions };
export { AsyncQueueClearedError, AsyncQueueReplacedError };

export interface UseAsyncQueueOptions {
    onError?: (error: unknown) => void;
    concurrency?: number;
}

export interface UseAsyncQueueReturn {
    enqueue: <T>(task: () => Promise<T>, options?: EnqueueOptions) => Promise<T>;
    status: AsyncQueueStatus;
    pending: number;
    running: number;
    queued: number;
    isPaused: boolean;
    clear: () => number;
    cancel: (key: string) => number;
    pause: () => void;
    resume: () => void;
}

export interface AsyncQueueProviderProps {
    children?: ReactNode;
    concurrency?: number;
}

const AsyncQueueContext = createContext<AsyncQueue | null>(null);

export function AsyncQueueProvider(props: AsyncQueueProviderProps) {
    const queue = useMemo(() => createAsyncQueue({ concurrency: props.concurrency }), []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (props.concurrency !== undefined) queue.setConcurrency(props.concurrency);
    }, [queue, props.concurrency]);

    return createElement(AsyncQueueContext.Provider, { value: queue }, props.children);
}

/**
 * Serializes async work so overlapping calls can't finish out of order — the
 * classic last-write-wins bug where two rapid saves race and the older
 * response lands last. At the default concurrency of 1, task N+1 is not
 * started until task N has settled.
 *
 * Raise `concurrency` to turn the same queue into a bounded worker pool —
 * uploading fifty files three at a time instead of all at once — while still
 * admitting them in enqueue order.
 *
 * Which queue you get:
 *
 *   useAsyncQueue()          private to this hook instance, or the provider's
 *                            queue when rendered inside AsyncQueueProvider
 *   useAsyncQueue('row:7')   shared by every call using that key, anywhere in
 *                            the app — a key always wins over the provider,
 *                            so a subtree can opt back out of the shared queue
 *
 * A failed task rejects its own `enqueue()` promise without blocking the ones
 * behind it. Handle that promise, or pass `onError` and use `void enqueue(…)`
 * for fire-and-forget work.
 *
 * Per task, `enqueue(task, { priority, key, replace })` can jump the line
 * (higher `priority` first, FIFO within a tier) and collapse duplicates: with
 * `replace`, a newer task drops the one still waiting under the same `key`, so
 * ten autosaves of one field queue one write instead of ten. `cancel(key)`
 * drops what is waiting under a key; `pause()`/`resume()` hold the line
 * without losing it.
 *
 * Dropping a task rejects its promise but is not routed to `onError` — a
 * superseded save is the queue doing its job, not a failure worth reporting.
 */
export function useAsyncQueue(
    key?: string,
    options: UseAsyncQueueOptions = {}
): UseAsyncQueueReturn {
    const { concurrency } = options;
    const contextQueue = useContext(AsyncQueueContext);

    const privateQueueRef = useRef<AsyncQueue | null>(null);
    const getPrivateQueue = (): AsyncQueue => {
        let queue = privateQueueRef.current;

        if (queue === null) {
            queue = createAsyncQueue({ concurrency });
            privateQueueRef.current = queue;
        }

        return queue;
    };

    const queue = key !== undefined ? getAsyncQueue(key) : (contextQueue ?? getPrivateQueue());

    const onErrorRef = useRef(options.onError);
    onErrorRef.current = options.onError;

    useEffect(() => {
        if (concurrency !== undefined) queue.setConcurrency(concurrency);
    }, [queue, concurrency]);

    const enqueue = useCallback(
        <T>(task: () => Promise<T>, taskOptions?: EnqueueOptions): Promise<T> => {
            const result = queue.enqueue(task, taskOptions);
            const onError = onErrorRef.current;

            if (onError) {
                result.catch(error => {
                    if (isAsyncQueueCancellation(error)) return;

                    onError(error);
                });
            }

            return result;
        },
        [queue]
    );

    const clear = useCallback(() => queue.clear(), [queue]);
    const cancel = useCallback((taskKey: string) => queue.cancel(taskKey), [queue]);
    const pause = useCallback(() => queue.pause(), [queue]);
    const resume = useCallback(() => queue.resume(), [queue]);

    const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);

    return {
        enqueue,
        status: snapshot.status,
        pending: snapshot.pending,
        running: snapshot.running,
        queued: snapshot.queued,
        isPaused: snapshot.isPaused,
        clear,
        cancel,
        pause,
        resume,
    };
}

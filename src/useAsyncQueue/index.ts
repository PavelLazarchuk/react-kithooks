import {
    createContext,
    createElement,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';

import { createAsyncQueue } from '../internal/createAsyncQueue';
import type { AsyncQueue, AsyncQueueStatus } from '../internal/createAsyncQueue';
import { getAsyncQueue } from './store';

export type { AsyncQueueStatus };

export interface UseAsyncQueueOptions {
    onError?: (error: unknown) => void;
}

export interface UseAsyncQueueReturn {
    enqueue: <T>(task: () => Promise<T>) => Promise<T>;
    status: AsyncQueueStatus;
    pending: number;
}

export interface AsyncQueueProviderProps {
    children?: ReactNode;
}

const AsyncQueueContext = createContext<AsyncQueue | null>(null);

export function AsyncQueueProvider(props: AsyncQueueProviderProps) {
    const queue = useMemo(() => createAsyncQueue(), []);

    return createElement(AsyncQueueContext.Provider, { value: queue }, props.children);
}

/**
 * Serializes async work so overlapping calls can't finish out of order — the
 * classic last-write-wins bug where two rapid saves race and the older
 * response lands last. Task N+1 is not started until task N has settled.
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
 */
export function useAsyncQueue(
    key?: string,
    options: UseAsyncQueueOptions = {}
): UseAsyncQueueReturn {
    const contextQueue = useContext(AsyncQueueContext);

    const privateQueueRef = useRef<AsyncQueue | null>(null);
    const getPrivateQueue = (): AsyncQueue => {
        let queue = privateQueueRef.current;

        if (queue === null) {
            queue = createAsyncQueue();
            privateQueueRef.current = queue;
        }

        return queue;
    };

    const queue = key !== undefined ? getAsyncQueue(key) : (contextQueue ?? getPrivateQueue());

    const onErrorRef = useRef(options.onError);
    onErrorRef.current = options.onError;

    const enqueue = useCallback(
        <T>(task: () => Promise<T>): Promise<T> => {
            const result = queue.enqueue(task);
            const onError = onErrorRef.current;

            if (onError) result.catch(error => onError(error));

            return result;
        },
        [queue]
    );

    const snapshot = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);

    return { enqueue, status: snapshot.status, pending: snapshot.pending };
}

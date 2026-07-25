import { createAsyncQueue } from '../internal/createAsyncQueue';
import type { AsyncQueue } from '../internal/createAsyncQueue';
import { createDisposeScheduler } from '../internal/disposeWhenUnused';
import { createKeyedCache } from '../internal/keyedCache';

const queues = createKeyedCache<string, AsyncQueue>(key => {
    const scheduleDispose = createDisposeScheduler(
        () => queue.isDisposable() && queues.peek(key) === queue,
        () => queues.delete(key)
    );
    const queue = createAsyncQueue({ onDisposable: scheduleDispose });

    return queue;
});

export function getAsyncQueue(key: string): AsyncQueue {
    return queues.get(key);
}

export function resetAsyncQueuesForTests(): void {
    queues.reset();
}

# useAsyncQueue

Serializes async work so overlapping calls can't finish out of order. Task N+1 doesn't start until task N has settled — or, with `concurrency`, a bounded worker pool that still admits tasks in order.

```ts
import { useAsyncQueue, AsyncQueueProvider } from 'react-kithooks/useAsyncQueue';
```

## The problem

Two rapid saves of the same row both go out; the network answers the _first_ one last; the older payload lands after the newer one and wins. Classic last-write-wins corruption, and it doesn't reproduce locally because the latency there is too uniform.

Debouncing hides it, it doesn't fix it — the moment two requests are genuinely in flight the race is back. A queue with concurrency 1 removes the race by construction: order of completion equals order of enqueue.

## Usage

```tsx
const { enqueue, status, pending } = useAsyncQueue(`row:${rowId}`);

// two fast edits reach the server in the order they were made,
// not in the order the network happens to answer
const onBlur = (next: string) => void enqueue(() => api.patchRow(rowId, { value: next }));

{
    status === 'running' && <Spinner label={`Saving ${pending}…`} />;
}
```

Awaiting the result:

```tsx
const { enqueue } = useAsyncQueue('checkout');

const submit = async () => {
    try {
        const order = await enqueue(() => api.placeOrder(cart));
        router.push(`/orders/${order.id}`);
    } catch (err) {
        setError(err);
    }
};
```

Fire-and-forget with a handler:

```tsx
const { enqueue } = useAsyncQueue('telemetry', { onError: reportToSentry });

void enqueue(() => api.track(event));
```

A bounded worker pool — fifty files, three at a time, cancellable:

```tsx
const { enqueue, clear, running, queued } = useAsyncQueue('uploads', { concurrency: 3 });

const onDrop = (files: File[]) => {
    for (const file of files) void enqueue(() => api.upload(file));
};

return (
    <>
        <p>
            {running} uploading, {queued} waiting
        </p>
        {/* drops what hasn't started; uploads already in flight finish */}
        <button onClick={clear}>Cancel remaining</button>
    </>
);
```

## Which queue you get

|                                   | no `key`                                    | with `key`                                    |
| --------------------------------- | ------------------------------------------- | --------------------------------------------- |
| **no provider**                   | private to that one hook instance           | shared by every call using that key, app-wide |
| **inside `<AsyncQueueProvider>`** | the provider's queue, shared by the subtree | still the keyed queue — a key always wins     |

A key always beats the provider, so a subtree can opt back out of the shared queue.

## API

```ts
function useAsyncQueue(key?: string, options?: UseAsyncQueueOptions): UseAsyncQueueReturn;
```

### Parameters

| Parameter | Type     | Description                                                         |
| --------- | -------- | ------------------------------------------------------------------- |
| `key`     | `string` | Queue identity. Omit for a per-instance (or provider-scoped) queue. |

### Options

| Option        | Type                       | Default | Description                                                                               |
| ------------- | -------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| `onError`     | `(error: unknown) => void` | —       | Called when a task rejects. Also marks the promise handled, so `void enqueue(…)` is safe. |
| `concurrency` | `number`                   | `1`     | How many tasks may run at once. `1` is a mutex; higher makes it a worker pool.            |

### Returns

| Field     | Type                                        | Description                                                                          |
| --------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `enqueue` | `<T>(task: () => Promise<T>) => Promise<T>` | Queues a task; resolves/rejects with that task's own result.                         |
| `status`  | `'idle' \| 'running'`                       | Whether the queue is currently working.                                              |
| `pending` | `number`                                    | Tasks not yet settled — `running + queued`.                                          |
| `running` | `number`                                    | Tasks currently executing.                                                           |
| `queued`  | `number`                                    | Tasks admitted but not started yet.                                                  |
| `clear`   | `() => number`                              | Drops every not-yet-started task and returns how many. Running tasks are unaffected. |

### AsyncQueueProvider

Gives every keyless `useAsyncQueue()` in the subtree one shared queue.

```tsx
<AsyncQueueProvider concurrency={2}>
    <EditorPanel />
</AsyncQueueProvider>
```

| Prop          | Type        | Default | Description                          |
| ------------- | ----------- | ------- | ------------------------------------ |
| `children`    | `ReactNode` | —       |                                      |
| `concurrency` | `number`    | `1`     | Concurrency for the subtree's queue. |

## Notes

- **A failed task rejects its own `enqueue()` promise without blocking the ones behind it.** The queue never poisons itself on a rejection. Handle the returned promise, or pass `onError` and use `void enqueue(…)`.
- `onError` is read at enqueue time, so a task is always reported to the handler that was in place when it was queued.
- **Queues live outside the React tree.** A task survives the unmount of the component that queued it — a save started on the way out still lands. They're in-memory only: a reload drops whatever hadn't run.
- **Latency is additive by design** at concurrency 1. Prefer narrow keys (`row:7`, `doc:${id}`) over one global queue, so unrelated work doesn't wait in line.
- **Concurrency belongs to the queue, not to the call site.** For a shared key the most recently applied value wins, so pass it consistently — or from a single place — when several components use the same key. Raising it admits waiting tasks immediately; lowering it only affects tasks that haven't started, since a running promise can't be un-started. Anything below 1 (or not a finite number) is treated as 1, so a bad value can never stall the queue.
- **`clear()` only drops what hasn't started.** Dropped tasks reject with an `AsyncQueueClearedError` — a promise nobody will ever settle would leak on every awaiting caller. That rejection is pre-marked as handled, so cancelling a batch of `void enqueue(…)` uploads doesn't spray unhandled rejections; a caller that _does_ await its own promise still sees it reject.
- **Ordering is FIFO at any concurrency** — tasks are admitted in enqueue order. Above 1 they can still _finish_ out of order, which is the point of a pool; use concurrency 1 when completion order is what matters.
- **Keyed queues are global, and released once nothing observes them and nothing is left to run.** A queue with work still in it is never dropped — the next component to use that key joins the same queue, which is what keeps ordering intact across an unmount.

## Related

- [useAbortableFetch](../useAbortableFetch/README.md) — for reads, where cancelling the stale request is better than queueing it.
- [useDebouncedCallback](../useDebouncedCallback/README.md) — reduce how many requests happen at all, then queue what's left.

## SSR

Server-renders `{ status: 'idle', pending: 0, running: 0, queued: 0 }`.

---

[← All hooks](../../README.md)

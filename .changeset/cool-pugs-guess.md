---
'react-kithooks': minor
---

Add `useAsyncQueue` and expand error handling on the storage hooks.

- **New hook `useAsyncQueue`** — serializes async work so overlapping calls can't finish out of order (the last-write-wins race where two rapid saves settle in the wrong order). Task N+1 starts only after task N settles, and a failed task rejects its own `enqueue()` promise without blocking the ones behind it. Exposes `enqueue`, `status` and `pending`, plus an `AsyncQueueProvider` for sharing one queue across a subtree. Called with a key (`useAsyncQueue('row:7')`) the queue is shared app-wide by that key; a key always wins over the provider, so a subtree can opt back out.
- **`useIndexedDB`**: new `onError` option. Failed writes still surface as `status: 'error'` and reject the promise returned by `setValue`/`removeValue`; `onError` lets you use the `void setValue(…)` fire-and-forget form without an unhandled rejection.
- **Per-hook documentation** under `docs/`, with the README trimmed to an overview and links.

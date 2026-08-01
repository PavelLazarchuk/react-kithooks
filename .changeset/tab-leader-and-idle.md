---
'react-kithooks': minor
---

Two new hooks:

- `useTabLeader` — elects exactly one tab as the leader for a key across every open tab, via the Web Locks API where available (instant failover when the leader's tab closes or crashes) with a `localStorage`-heartbeat fallback otherwise.
- `useIdle` — wall-clock-verified inactivity detection that survives background-tab timer throttling and laptop sleep, with capture-phase listeners, throttled notifications instead of a per-`mousemove` timer re-arm, and optional cross-tab activity sync.

Additions to existing hooks:

- `usePermission` — new kinds `clipboard-write` and `persistent-storage`. The latter requests via `navigator.storage.persist()` and is worth asking for alongside `useIndexedDB`/`useFormCrashRecovery`, since without it the browser may evict your origin's storage; where the Permissions API has no entry for it (Safari), `navigator.storage.persisted()` answers instead. `request('clipboard-write')` deliberately never writes, so probing can't destroy the user's clipboard.
- `useAsyncQueue` — new `concurrency` option turning the queue into a bounded worker pool (uploads three at a time) while still admitting tasks in order, plus `running`/`queued` counts and `clear()` to drop not-yet-started tasks. Cleared tasks reject with `AsyncQueueClearedError`, pre-marked as handled so cancelling a batch of `void enqueue(…)` work doesn't produce unhandled rejections. `AsyncQueueProvider` accepts `concurrency` too.
- `useDebouncedValue` and `useDebouncedCallback` — new `maxWaitMs` option capping how long an update or call can be starved. A plain debounce never fires while input keeps arriving faster than the delay, so a continuously-typed search shows no results and a continuously-typed autosave saves nothing.

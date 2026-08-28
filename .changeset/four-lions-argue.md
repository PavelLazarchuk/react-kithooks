---
'react-kithooks': patch
---

fix(useLocalStorage, useSessionStorage, useAbortableFetch, useIndexedDB): close disposal, enabled, and cache leaks

- `useLocalStorage`/`useSessionStorage`: a store that recovered from memory-only mode (e.g. after a quota error clears up) while it had no subscribers is now correctly scheduled for disposal instead of staying cached forever.
- `useAbortableFetch`: `refetch()` now respects `enabled: false` instead of firing a request while the hook is disabled.
- `useIndexedDB` (internal test helper `resetIdbConnectionsForTests`): now closes each cached `IDBDatabase` connection before clearing the cache, instead of leaking open connections.
- `useIndexedDB`: calling `setValue(prev => ...)` twice in a row no longer reads a stale snapshot for the second call — the pending value from the first call is now tracked synchronously so updates chain correctly instead of one overwriting the other.

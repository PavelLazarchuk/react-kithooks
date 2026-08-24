---
'react-kithooks': patch
---

feat(useAsyncQueue): warn in development when `concurrency` reconfigures a shared queue

Passing `concurrency` alongside a `key` (or inside an `AsyncQueueProvider`) silently changes the limit for every other consumer of that queue and is never reverted on unmount. That now warns once per queue in development, so the cross-component effect is visible at the call site. Runtime behaviour is unchanged.

---
'react-kithooks': minor
---

`useAsyncQueue` gains `idle()` — a promise that resolves once the queue is drained, for "block navigation until the autosaves land" where the caller holds no handle on the individual `enqueue()` promises. It reports drained, not successful: a task that threw still counts, and a paused queue with tasks in line stays pending until something drains it.

`usePreviousValue` takes an optional comparator as its second argument. The default stays `Object.is`, which is the wrong question for an object rebuilt every render — a fresh `{...}` with identical contents counted as a change, so "previous" always equalled the current value. Values the comparator folds together keep the reference the hook was already holding.

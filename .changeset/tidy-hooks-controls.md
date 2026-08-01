---
'react-kithooks': minor
---

`useDebouncedValue`, `useLocalStorage`/`useSessionStorage` and `useAsyncQueue` gain the controls their bare versions were missing.

**useDebouncedValue — `{ controls: true }`**

Returns `{ value, isPending, flush, cancel }` instead of the bare value. `isPending` is the "results below are stale" flag a search spinner needs; `flush()` publishes the current input now (Enter), `cancel()` abandons the pending update (Escape) without freezing the hook — the next change starts a fresh window. Called without the option, the hook is unchanged, down to the render count.

**useLocalStorage / useSessionStorage — `syncTabs`**

Defaults to `true`, the existing behaviour. `syncTabs: false` stops that instance from adopting values written by other tabs — wizard step, draft, filters — while still reading from storage on mount, still persisting writes, and still syncing every instance inside this tab.

**useAsyncQueue — priorities, pause/resume, keyed tasks**

`enqueue(task, { priority, key, replace })`: higher `priority` is admitted first (FIFO within a tier, never preempting a running task), and `replace` drops the task still waiting under the same `key`, collapsing ten keystroke-triggered saves of one field into one write. Plus `cancel(key)` to drop what is waiting under a key, and `pause()`/`resume()` to hold the line — while paused, a keyed queue is never garbage-collected, so it stays paused across a remount.

Behaviour change in the same hook: a task the queue drops — by `clear()`, `cancel(key)` or `replace` — is no longer routed to `onError`. Its promise still rejects, so `await enqueue(…)` sees it; but reporting every superseded autosave as an error would bury the real ones.

New exports: `AsyncQueueReplacedError` (what a replaced task rejects with), `EnqueueOptions`, `DebouncedValue`, `UseDebouncedValueControlsOptions`. `AsyncQueueStatus` gains `'paused'` and the snapshot gains `isPaused` — a `switch` over the status that must stay exhaustive needs the new arm.

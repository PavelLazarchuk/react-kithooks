---
'react-kithooks': patch
---

fix(useIsFirstRender, useAsyncQueue): flip on layout effect, serialize same-key tasks across concurrency

- `useIsFirstRender`: flips its ref in a layout effect instead of a passive one, so it no longer reports `true` for a genuine second render triggered by a synchronous `setState` inside another component's `useLayoutEffect` before the passive effect had a chance to run.
- `internal/errorName`: an error object with an explicit `name: undefined` now returns `''` instead of the literal string `"undefined"`.
- `useAsyncQueue`/`createAsyncQueue`: at `concurrency > 1`, a task is no longer started while another task with the same `key` is already running — closing the last-write-wins race `replace: true` is documented to prevent, which previously only held at the default concurrency of 1.

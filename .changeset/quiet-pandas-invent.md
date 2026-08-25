---
'react-kithooks': patch
---

fix(usePermission): a slower, superseded query no longer reverts a fresher result

Two overlapping `refresh()` calls sharing the same activation epoch — a `visibilitychange` refresh racing an explicit `request()`'s own `await store.refresh()` — could resolve out of order. Whichever `navigator.permissions.query()` happened to settle last always won, even when it was the older call reporting a now-outdated state, silently reverting the snapshot until the next native `change` event. Each `refresh()` call is now tagged with a sequence number, and only the most recently started call is allowed to apply its result.

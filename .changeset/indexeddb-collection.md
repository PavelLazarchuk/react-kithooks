---
'react-kithooks': minor
---

Add `useIndexedDBCollection` — a live view over a whole object store: cursor reads with `index`, `range`, `direction`, `limit` and `offset`, on-demand index creation, batched all-or-nothing `setMany`/`removeMany`, plus `count` and `iterate` for work too large to materialise. Writes from `useIndexedDB` and `useIndexedDBCollection` on the same store now refresh each other, in this tab and across tabs.

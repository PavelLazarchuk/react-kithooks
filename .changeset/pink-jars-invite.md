---
'react-kithooks': patch
---

Fix four correctness bugs found in a full review:

- **`useIndexedDB`**: a read started before a write could settle after it and republish the pre-write value. Reads and writes now take a ticket, so only the newest one publishes.
- **`useIndexedDBCollection`**: a burst of change notifications started overlapping cursor reads that could settle out of order, leaving the list showing stale records until the next change. Superseded reads are now discarded.
- **`useIndexedDB` / `useIndexedDBCollection` / `useFormCrashRecovery`**: a failed database upgrade (blocked by another tab, quota, corruption) left a closed `IDBDatabase` in the connection cache, so every later operation on that database failed with `InvalidStateError` for the lifetime of the page. The cache is now cleared before the reopen, and a closed connection is detected and reopened instead of reused.
- **`useTabLeader`**: on the Web Locks path a non-leader tab reported `status: 'pending'` forever instead of settling on `'follower'`, contradicting the documented contract that both mechanisms behave identically. It now settles correctly; `isLeader` and `onBecomeLeader`/`onBecomeFollower` are unchanged.

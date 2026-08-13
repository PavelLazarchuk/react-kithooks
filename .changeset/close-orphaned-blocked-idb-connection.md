---
'react-kithooks': patch
---

Fix a leaked IndexedDB connection after a blocked upgrade, affecting `useIndexedDB`, `useIndexedDBCollection` and `useFormCrashRecovery`.

Creating a store or an index bumps the database version, and another tab holding the database open blocks that upgrade. The blocked open was reported as a failure — correctly — but rejecting a promise cannot cancel an `IDBOpenDBRequest`, and IndexedDB offers no way to cancel one. So when the other tab eventually closed, the upgrade went through anyway and handed back a connection nothing held a reference to. Being unreachable, it could never be closed, and it blocked every subsequent upgrade of that database for the rest of the page's life — turning one transient conflict into a permanent one. Such a connection is now closed as soon as it arrives.

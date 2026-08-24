---
'react-kithooks': patch
---

fix(useIndexedDB, useIndexedDBCollection, useFormCrashRecovery): a read whose transaction aborts no longer hangs forever

`idbGet` listened only to its own request. A transaction can abort without any request reporting an error — the database closing under it, or another tab's version upgrade taking it down — and in that case neither `onsuccess` nor `onerror` ever fired, so the promise never settled: `await` never returned, and `useIndexedDB` sat in `status: 'loading'` for the life of the page. Reads now go through the same transaction wrapper as every other operation, which settles on `oncomplete`, `onerror` and `onabort` alike. `idbSet` and `idbRemove` moved onto it too, so a write that throws synchronously (a non-cloneable value) now aborts its transaction instead of leaving it open.

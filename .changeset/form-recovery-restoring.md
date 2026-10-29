---
'react-kithooks': patch
---

Fix drafts lost to edits made while they were being read, and two smaller bugs

- `useFormCrashRecovery`: an edit made while the stored draft was still being read (`status: 'restoring'`) was saved over it once the debounce ran out, or on unmount and `pagehide` — so on a slow IndexedDB open the crash draft the hook exists to protect was gone before it could be offered. Nothing is written while restoring now; held edits are saved as soon as the read finds no draft.
- `usePolling`: a poller that throws synchronously, before returning a promise, counts as a failed tick. Before, the exception escaped the timer, `isFetching` stayed `true` and polling stopped for good.
- `useLocalStorage` / `useSessionStorage`: a value the serializer turns into a non-string — `setValue(undefined)` with the default `JSON.stringify` — removes the key instead of storing the text `"undefined"`.

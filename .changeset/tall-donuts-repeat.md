---
'react-kithooks': patch
---

Fix stale-write and listener-leak bugs found in review:

- `useAbortableFetch`: disabling the hook or unmounting now retires the in-flight
  request id as well as aborting it. A fetcher that ignores its `AbortSignal`
  could previously still land its result and flip the hook to `success` after it
  had been disabled — the exact stale write the hook exists to prevent.
- `usePermission`: a `navigator.permissions.query()` that resolved after the last
  subscriber unmounted attached a `change` listener that nothing ever removed, so
  every mount/unmount cycle leaked one. The listener is now only attached if that
  activation is still current.
- `useFormCrashRecovery`: a flush triggered by a `key` change could post its
  conflict message on the _new_ key's `BroadcastChannel`, giving other tabs a
  bogus conflict for a key that was never written. The channel is now captured
  with its key and only used when they match, and a `postMessage` on a channel
  closed mid-write no longer turns a successful save into `status: 'error'`.
- `useFormCrashRecovery`: `stripNonCloneable` cleaned only the first occurrence of
  a shared object reference and returned later ones untouched, so the retry after
  a `DataCloneError` threw again and the draft was lost.
- Internals: the keyed store cache no longer treats a falsy cached value as a
  miss, and the dev-mode check no longer throws when a browser shim defines
  `process` without `process.env`.

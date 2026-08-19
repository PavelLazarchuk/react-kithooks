---
'react-kithooks': minor
---

Add `useSingleFlight` — runs an async function at most once at a time, so a double-clicked submit can't fire the request twice. Calls made while one is in flight are dropped by default (`mode: 'share'` hands them the running promise instead), `pending` comes back as state for binding `disabled`, and the lock is released on resolve, reject, and synchronous throw alike.

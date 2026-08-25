---
'react-kithooks': patch
---

fix(useLocalStorage, useSessionStorage): a transient write failure no longer permanently disables resync or leaks the cache entry

A write that threw once (a momentary `QuotaExceededError`, storage denied for a beat) set the shared store's memory-only flag and never cleared it, even after a later write succeeded. Stuck memory-only, the key skipped the resubscribe re-read added to catch same-tab writes that bypass the hook, and was permanently excluded from cache eviction — one cache entry leaked per affected key for the page's lifetime. The flag now clears on the next write that actually reaches storage.

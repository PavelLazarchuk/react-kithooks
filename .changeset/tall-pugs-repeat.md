---
'react-kithooks': patch
---

fix(useFormCrashRecovery): drop values that don't survive a structured clone in the `DataCloneError` fallback

`stripNonCloneable` only removed functions and symbols and passed every other non-plain object through untouched, so a DOM element, `window`, or an event stored in the form values made the retry `idbPut` fail with the same `DataCloneError` — the draft was lost and the status went to `error`. Non-plain objects are now probed with `structuredClone` (with a prototype-tag fallback where it is unavailable, and a hard reject for DOM host objects) and dropped, by path, when they cannot be persisted. Clonable built-ins such as `Date`, `Map`, `Set`, `Blob`, and typed arrays are still kept.

---
'react-kithooks': patch
---

fix(useFormCrashRecovery): `clear()` now re-enables persistence after a `QuotaExceededError` (or a `first-tab-wins` conflict) had stopped it — previously a single failed write disabled drafts for the lifetime of the hook, even though `clear()` is what frees the space.

---
'react-kithooks': patch
---

fix(useFormCrashRecovery): `flush()` no longer overwrites an unconsumed recovered draft

The debounced-persist effect only armed a write while `recovered` was still empty, but `flush()` — the function the armed timer, `pagehide`, `visibilitychange` and unmount all eventually call — never checked it. A `value` change landing between mount and the recovery read resolving (a normal ordering: React Hook Form hydrating `defaultValues` right after mount, before the async IndexedDB read returns) still scheduled a write. Once recovery resolved and populated `recovered`, that already-armed write fired anyway and silently replaced the stored draft with the pre-recovery value — the only copy that would have survived a second crash before the user restored or discarded it. `flush()` now bails out while a recovered draft is unconsumed, matching the scheduling effect's own rule.

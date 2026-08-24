---
'react-kithooks': patch
---

fix(usePolling): hiding the tab during the very first request no longer leaves `status: 'loading'` stuck — the paused hook falls back to `'idle'` (so a skeleton doesn't hang behind a hidden tab), and because the in-flight run was aborted, coming back starts a fresh request immediately instead of waiting out the interval.

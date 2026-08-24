---
'react-kithooks': patch
---

fix(useLocalStorage/useSessionStorage): re-read storage when a surviving store is resubscribed, so a same-tab write that bypassed the hook is no longer missed

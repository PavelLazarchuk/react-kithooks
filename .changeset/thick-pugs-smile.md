---
'react-kithooks': minor
---

Add `usePolling` — interval polling that never overlaps ticks, pauses on a hidden tab and while offline (resuming only when a tick is actually due), and backs off exponentially with jitter on consecutive failures. Superseded responses are discarded via the same run-id guard `useAbortableFetch` uses.

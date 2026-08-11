---
'react-kithooks': patch
---

`useMediaQuery` now caches the `MediaQueryList` per query string instead of calling `window.matchMedia(query)` on every render and every snapshot read. `matches` is live on the list itself, so a fresh one bought nothing. Behaviour is unchanged; the standalone import grows from 124 B to 162 B.

---
'react-kithooks': patch
---

fix(useMediaQuery): evict the shared `MediaQueryList` cache by LRU instead of dropping it whole

The cache that `useMediaQuery`, `useBreakpoint`, `usePrefersColorScheme` and `usePrefersReducedMotion` share was cleared entirely once it reached 200 entries — including lists that live components were still subscribed to. Those listeners stay attached to the discarded object while every later snapshot read builds and reads a _second_ `MediaQueryList` for the same query, so an app that rotates through many queries quietly accumulated a duplicate list per subscribed query.

Entries are now evicted one at a time, least-recently-used first, and only when nothing is subscribed to them. A query with live subscribers is never evicted, so a component keeps the list it is listening to for as long as it is mounted.

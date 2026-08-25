---
'react-kithooks': patch
---

fix(useScrollAnchor): a container swap no longer applies a stale anchor from the previous element

Attaching the `ref` to a new DOM node reset the tracked element and the programmatic-scroll marker, but left the pending-anchor, settle-window and smooth-scroll state untouched. A `prepend()` on one container followed by a ref swap to a different one — a virtualized or filtered list remounting its scroll element — left the old container's anchor and timers alive: the next mutation on the new container either mis-anchored against an element it doesn't contain, or applied the old container's scroll-height delta to the new one's geometry. All of that state is now cleared whenever the ref receives a different node.

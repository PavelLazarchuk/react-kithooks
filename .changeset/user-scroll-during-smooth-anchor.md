---
'react-kithooks': patch
---

**`useScrollAnchor` ignored user scrolls made during a smooth `scrollToBottom()`.** `scrollToBottom({ behavior: 'smooth' })` opens a window (up to a second) in which the hook's `scroll` handler returns early, so the animation's own events don't get mistaken for user intent. Wheel, touch and key events cancelled only the post-prepend settle window, not that one — so a reader who scrolled up mid-animation was still reported as `isAtBottom: true`: the "jump to bottom" button never appeared, and every incoming message pinned them back to the bottom. User intent now ends the smooth-scroll window too, and re-evaluates the bottom state immediately.

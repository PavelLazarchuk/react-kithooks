---
'react-kithooks': minor
---

Add `useFocusTrap` — confines Tab to a container and returns focus when it closes.

Focus wrapping runs on sentinel nodes placed around the container rather than on intercepted `keydown`s, so the tab order stays the browser's own and content that becomes focusable after activation is picked up automatically. A `focusin`/`focusout` net catches focus that leaves by any other route — a click outside, a stray `.focus()`, or a removed node dropping focus to `<body>`. Traps stack the same way `useKeyboardScope` stacks shortcuts: the most recently activated trap owns focus and suspends the ones below it, with `priority` to override.

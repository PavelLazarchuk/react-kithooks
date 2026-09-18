---
'react-kithooks': minor
---

Two more of the modal set: `useLockBodyScroll` and `useUnsavedChanges`.

- **`useLockBodyScroll(locked, options?)`** freezes the page behind a dialog and fixes the three bugs the `overflow: hidden` one-liner has: iOS Safari scrolls anyway, so `strategy: 'auto'` pins `<body>` with `position: fixed` there and scrolls back on release; hiding the scrollbar shifts the layout, so its width is paid back as `padding-right` (`gutter`); and two dialogs closing in the wrong order leave the page frozen or unfreeze it early, so locks stack per document and the page is restored — from the inline styles it had before the first lock — only when the last one goes. `inert: true` marks everything outside the container, taking the page away from the keyboard and the screen reader too.
- **`useUnsavedChanges(isDirty, options?)`** attaches `beforeunload` only while the form is dirty, so a page that is merely _capable_ of being dirty stays eligible for Chrome's back/forward cache. `beforeunload` never fires on a client-side route change, so the hook also returns `confirmLeave()` for a router blocker — `useBlocker` in React Router, `router.events` in the Next.js pages router — with `onNavigate` to ask in your own dialog instead of `window.confirm`.

907 B and 302 B gzipped, tree-shaken.

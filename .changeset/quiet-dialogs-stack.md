---
'react-kithooks': patch
---

fix(useLockBodyScroll): count `inert` markings across stacked dialogs, lock the container's own document, and scroll back instantly under `scroll-behavior: smooth`

- `useLockBodyScroll` with `inert: true`: closing the first of two stacked dialogs no longer hands the page back to the keyboard and the screen reader while the second is still open. The second dialog skipped the elements the first had already marked, so the first release took their `inert` away. Markings are now counted per document, so an element stays `inert` until every dialog that marked it has closed, in any order. An element that was `inert` before any lock is still left alone.
- `useLockBodyScroll`: a dialog portaled into another document, such as an iframe, now locks that document instead of the page running the hook. The hook always locked the global `document`, and the `inert` pass skipped every element from another realm, so nothing inside the iframe was marked. The lock now follows the `ref`'s `ownerDocument` and falls back to the global `document` when no `ref` is attached.
- `useLockBodyScroll` (`'fixed'` strategy, the default on iOS): the scroll back to where the reader was is now instant. Under `scroll-behavior: smooth` on `<html>`, as set by Tailwind's `scroll-smooth`, the page used to animate down from the top every time a dialog closed.
- `useUnsavedChanges` docs: the bfcache rationale no longer claims that Chrome refuses to cache a page with a `beforeunload` listener.

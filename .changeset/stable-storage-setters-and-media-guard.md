---
'react-kithooks': patch
---

**`useLocalStorage` / `useSessionStorage` hand back a stable `setValue` again when `serialize`/`deserialize` are passed inline.** Both were dependencies of the `useCallback`, and options are normally written as an object literal — so a custom serializer was a fresh function on every render, `setValue` changed identity every render, and any memoized child or effect depending on it re-ran on every pass. They now live in refs, like the other option callbacks in this package; the latest one is still what gets called.

**`useMediaQuery` no longer throws where `matchMedia` is unavailable.** Reading `window.matchMedia(query)` unguarded threw a `TypeError` in webviews and test environments that don't implement it, taking the render down with it. Such an environment now reports `false` and stays inert, and the hook picks the real API up if it appears later. The per-query cache is also bounded now, so an app deriving queries from a live value can't grow it without limit. The standalone import grows from 162 B to 222 B.

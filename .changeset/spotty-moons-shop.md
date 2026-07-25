---
'react-kithooks': patch
---

Fix client-module marking, permission reporting and several resource leaks.

- **Package**: entry files in `dist` are now emitted with the `'use client'` directive, so the hooks can be imported from React Server Component apps without a manual wrapper.
- **`usePermission`**: a geolocation request that fails for a non-permission reason (timeout, position unavailable) no longer reports `granted`; it resolves to a non-authoritative `prompt`.
- **`useOnlineStatus`**: the reachability ping uses `mode: 'no-cors'`, so a cross-origin endpoint without CORS headers is no longer silently reported as offline.
- **`useScrollAnchor`**: `scrollToBottom` falls back to `auto` when the user prefers reduced motion, and the pending-scroll timer is cleared on unmount.
- **`useLocalStorage` / `useSessionStorage`**: storage access that throws (Safari private mode, blocked third-party storage) is handled instead of propagating, and unobserved keys are dropped from the store cache so long-lived apps don't accumulate stores.
- **`useFormCrashRecovery` / `useIndexedDB`**: both now share one IndexedDB layer; the non-serializable-field warning is dev-only.
- **`useAbortableFetch`**: warns in development when the `deps` array changes length between renders.
- **`useKeyboardScope`**: bindings are matched without re-normalizing every entry on each keystroke, and the scope ordering is cached.

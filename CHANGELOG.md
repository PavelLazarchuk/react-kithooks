# react-kithooks

## 1.2.1

### Patch Changes

- 4cbcfe3: Fix stale-write and listener-leak bugs found in review:

    - `useAbortableFetch`: disabling the hook or unmounting now retires the in-flight
      request id as well as aborting it. A fetcher that ignores its `AbortSignal`
      could previously still land its result and flip the hook to `success` after it
      had been disabled — the exact stale write the hook exists to prevent.
    - `usePermission`: a `navigator.permissions.query()` that resolved after the last
      subscriber unmounted attached a `change` listener that nothing ever removed, so
      every mount/unmount cycle leaked one. The listener is now only attached if that
      activation is still current.
    - `useFormCrashRecovery`: a flush triggered by a `key` change could post its
      conflict message on the _new_ key's `BroadcastChannel`, giving other tabs a
      bogus conflict for a key that was never written. The channel is now captured
      with its key and only used when they match, and a `postMessage` on a channel
      closed mid-write no longer turns a successful save into `status: 'error'`.
    - `useFormCrashRecovery`: `stripNonCloneable` cleaned only the first occurrence of
      a shared object reference and returned later ones untouched, so the retry after
      a `DataCloneError` threw again and the draft was lost.
    - Internals: the keyed store cache no longer treats a falsy cached value as a
      miss, and the dev-mode check no longer throws when a browser shim defines
      `process` without `process.env`.

## 1.2.0

### Minor Changes

- 3921736: Add `usePolling` — interval polling that never overlaps ticks, pauses on a hidden tab and while offline (resuming only when a tick is actually due), and backs off exponentially with jitter on consecutive failures. Superseded responses are discarded via the same run-id guard `useAbortableFetch` uses.

## 1.1.0

### Minor Changes

- 34e552a: Add `useAsyncQueue` and expand error handling on the storage hooks.

    - **New hook `useAsyncQueue`** — serializes async work so overlapping calls can't finish out of order (the last-write-wins race where two rapid saves settle in the wrong order). Task N+1 starts only after task N settles, and a failed task rejects its own `enqueue()` promise without blocking the ones behind it. Exposes `enqueue`, `status` and `pending`, plus an `AsyncQueueProvider` for sharing one queue across a subtree. Called with a key (`useAsyncQueue('row:7')`) the queue is shared app-wide by that key; a key always wins over the provider, so a subtree can opt back out.
    - **`useIndexedDB`**: new `onError` option. Failed writes still surface as `status: 'error'` and reject the promise returned by `setValue`/`removeValue`; `onError` lets you use the `void setValue(…)` fire-and-forget form without an unhandled rejection.
    - **Per-hook documentation** under `docs/`, with the README trimmed to an overview and links.

### Patch Changes

- 34e552a: Fix client-module marking, permission reporting and several resource leaks.

    - **Package**: entry files in `dist` are now emitted with the `'use client'` directive, so the hooks can be imported from React Server Component apps without a manual wrapper.
    - **`usePermission`**: a geolocation request that fails for a non-permission reason (timeout, position unavailable) no longer reports `granted`; it resolves to a non-authoritative `prompt`.
    - **`useOnlineStatus`**: the reachability ping uses `mode: 'no-cors'`, so a cross-origin endpoint without CORS headers is no longer silently reported as offline.
    - **`useScrollAnchor`**: `scrollToBottom` falls back to `auto` when the user prefers reduced motion, and the pending-scroll timer is cleared on unmount.
    - **`useLocalStorage` / `useSessionStorage`**: storage access that throws (Safari private mode, blocked third-party storage) is handled instead of propagating, and unobserved keys are dropped from the store cache so long-lived apps don't accumulate stores.
    - **`useFormCrashRecovery` / `useIndexedDB`**: both now share one IndexedDB layer; the non-serializable-field warning is dev-only.
    - **`useAbortableFetch`**: warns in development when the `deps` array changes length between renders.
    - **`useKeyboardScope`**: bindings are matched without re-normalizing every entry on each keystroke, and the scope ordering is cached.

## 1.0.0

### Major Changes

- Initial release.
- TypeScript support.
- Documentation.

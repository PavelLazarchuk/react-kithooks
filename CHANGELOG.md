# react-kithooks

## 1.7.0

### Minor Changes

- f60704e: `useAsyncQueue` gains `idle()` — a promise that resolves once the queue is drained, for "block navigation until the autosaves land" where the caller holds no handle on the individual `enqueue()` promises. It reports drained, not successful: a task that threw still counts, and a paused queue with tasks in line stays pending until something drains it.

    `usePreviousValue` takes an optional comparator as its second argument. The default stays `Object.is`, which is the wrong question for an object rebuilt every render — a fresh `{...}` with identical contents counted as a change, so "previous" always equalled the current value. Values the comparator folds together keep the reference the hook was already holding.

### Patch Changes

- f60704e: `useMediaQuery` now caches the `MediaQueryList` per query string instead of calling `window.matchMedia(query)` on every render and every snapshot read. `matches` is live on the list itself, so a fresh one bought nothing. Behaviour is unchanged; the standalone import grows from 124 B to 162 B.

## 1.6.0

### Minor Changes

- 22ae20e: Add `useThrottledValue` and `useThrottledCallback`, and split `useAbortableFetch`'s loading state.

    **New: `useThrottledValue` / `useThrottledCallback`** — the other half of the debounce pair, for streams you have to react to _while_ they happen (scroll, pointer move, resize) rather than after they stop. The trailing edge is on by default, so the last change of a burst is always delivered instead of being dropped one window short — the bug that leaves a throttled progress bar at 97%. Pass `'frame'` instead of a number of milliseconds to rate-limit to one call per animation frame, which is what visual work actually wants; a ~16ms timer drifts across frames and fires twice in one and not at all in the next. `useThrottledCallback` keeps a stable identity, always calls the latest `fn`, and cancels on unmount; both offer `flush`/`cancel`/`isPending`.

    **`useAbortableFetch` now separates the first load from a refetch.** `status` describes what you have rather than what is in flight: it stays `'success'` (or `'error'`) while a refetch or a dep change runs, and `'loading'` is reserved for when there is genuinely nothing to render. That is the model `usePolling` already uses. The new `isFetching` is the in-flight flag.

    If you used `isLoading` to drive a spinner during a refresh, move it to `isFetching`:

    ```diff
    - const { data, isLoading } = useAbortableFetch(fetchInbox, []);
    + const { data, isLoading, isFetching } = useAbortableFetch(fetchInbox, []);

      if (isLoading) return <Skeleton />;       // unchanged: the first load
    - {isLoading && <Spinner />}                // no longer true during a refetch
    + {isFetching && <Spinner />}
    ```

    Also on `useAbortableFetch`:

    - `refetch()` returns a `Promise<void>` that resolves when the request settles, so a control can await its own work. It never rejects — read `status`/`error` for the outcome — and it also resolves when the run is superseded or cancelled, so an awaited call can't hang. Note for tests: it is now a thenable, so `act(() => refetch())` puts React's `act` into async mode; use `act(() => void refetch())` where you don't await it.
    - `cancel()` aborts the in-flight request and stops fetching without clearing what's on screen. Unlike `enabled: false`, it doesn't keep the hook stopped.
    - `keepPreviousData` (default `true`, the existing behavior) can be set to `false` to clear `data` and `error` on every new request, for the cases where showing the previous record under a new id would be wrong.
    - A failed request now keeps the last successful `data` instead of dropping it, matching `usePolling`, so a transient error doesn't blank the page.
    - A fetcher that throws synchronously lands in `error` like any rejection, instead of escaping into the effect as an unhandled rejection.

    **Internal: every hook is now covered by an SSR test suite.** `src/ssr.test.tsx` renders each hook with `renderToString` in a DOM-less Node environment and asserts the server value documented in the README, so the kit's SSR claim is verified in CI rather than by inspection.

## 1.5.0

### Minor Changes

- cca40ac: Add `useIndexedDBCollection` — a live view over a whole object store: cursor reads with `index`, `range`, `direction`, `limit` and `offset`, on-demand index creation, batched all-or-nothing `setMany`/`removeMany`, plus `count` and `iterate` for work too large to materialise. Writes from `useIndexedDB` and `useIndexedDBCollection` on the same store now refresh each other, in this tab and across tabs.

### Patch Changes

- cca40ac: Enforce per-hook bundle-size budgets in CI with size-limit, and document the measured sizes in the README.

## 1.4.0

### Minor Changes

- 99d8fbb: `useDebouncedValue`, `useLocalStorage`/`useSessionStorage` and `useAsyncQueue` gain the controls their bare versions were missing.

    **useDebouncedValue — `{ controls: true }`**

    Returns `{ value, isPending, flush, cancel }` instead of the bare value. `isPending` is the "results below are stale" flag a search spinner needs; `flush()` publishes the current input now (Enter), `cancel()` abandons the pending update (Escape) without freezing the hook — the next change starts a fresh window. Called without the option, the hook is unchanged, down to the render count.

    **useLocalStorage / useSessionStorage — `syncTabs`**

    Defaults to `true`, the existing behaviour. `syncTabs: false` stops that instance from adopting values written by other tabs — wizard step, draft, filters — while still reading from storage on mount, still persisting writes, and still syncing every instance inside this tab.

    **useAsyncQueue — priorities, pause/resume, keyed tasks**

    `enqueue(task, { priority, key, replace })`: higher `priority` is admitted first (FIFO within a tier, never preempting a running task), and `replace` drops the task still waiting under the same `key`, collapsing ten keystroke-triggered saves of one field into one write. Plus `cancel(key)` to drop what is waiting under a key, and `pause()`/`resume()` to hold the line — while paused, a keyed queue is never garbage-collected, so it stays paused across a remount.

    Behaviour change in the same hook: a task the queue drops — by `clear()`, `cancel(key)` or `replace` — is no longer routed to `onError`. Its promise still rejects, so `await enqueue(…)` sees it; but reporting every superseded autosave as an error would bury the real ones.

    New exports: `AsyncQueueReplacedError` (what a replaced task rejects with), `EnqueueOptions`, `DebouncedValue`, `UseDebouncedValueControlsOptions`. `AsyncQueueStatus` gains `'paused'` and the snapshot gains `isPaused` — a `switch` over the status that must stay exhaustive needs the new arm.

## 1.3.0

### Minor Changes

- b1424a9: Two new hooks:

    - `useTabLeader` — elects exactly one tab as the leader for a key across every open tab, via the Web Locks API where available (instant failover when the leader's tab closes or crashes) with a `localStorage`-heartbeat fallback otherwise.
    - `useIdle` — wall-clock-verified inactivity detection that survives background-tab timer throttling and laptop sleep, with capture-phase listeners, throttled notifications instead of a per-`mousemove` timer re-arm, and optional cross-tab activity sync.

    Additions to existing hooks:

    - `usePermission` — new kinds `clipboard-write` and `persistent-storage`. The latter requests via `navigator.storage.persist()` and is worth asking for alongside `useIndexedDB`/`useFormCrashRecovery`, since without it the browser may evict your origin's storage; where the Permissions API has no entry for it (Safari), `navigator.storage.persisted()` answers instead. `request('clipboard-write')` deliberately never writes, so probing can't destroy the user's clipboard.
    - `useAsyncQueue` — new `concurrency` option turning the queue into a bounded worker pool (uploads three at a time) while still admitting tasks in order, plus `running`/`queued` counts and `clear()` to drop not-yet-started tasks. Cleared tasks reject with `AsyncQueueClearedError`, pre-marked as handled so cancelling a batch of `void enqueue(…)` work doesn't produce unhandled rejections. `AsyncQueueProvider` accepts `concurrency` too.
    - `useDebouncedValue` and `useDebouncedCallback` — new `maxWaitMs` option capping how long an update or call can be starved. A plain debounce never fires while input keeps arriving faster than the delay, so a continuously-typed search shows no results and a continuously-typed autosave saves nothing.

## 1.2.2

### Patch Changes

- d49ca9d: Improve npm/search discoverability: rewrote `description` to lead with the
  package name and list the concrete hooks it covers instead of the generic
  "Kit for React hooks", added `kithooks`, `react-kithooks`, `react-hooks`, and
  `hooks-library` to `keywords`, and added npm version/downloads badges to the
  README.

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

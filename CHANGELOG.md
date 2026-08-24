# react-kithooks

## 1.10.7

### Patch Changes

- fa73225: fix(useDebouncedCallback): a changed `delayMs` now re-arms the call already waiting

    The pending timer kept the delay it was armed with, so a `delayMs` (or `maxWaitMs`) that changed mid-wait only took effect from the _next_ call — a control that drops its debounce from 1000 ms to 100 ms still made the user wait out the second the old value asked for. The wait is now measured from when the call was made and re-armed when the delay changes, so shortening it past the time already served fires the pending invocation at once, and lengthening it holds the call for the new delay counted from that same call rather than from the moment of the change. `useDebouncedValue` already re-armed on a changed delay; the two now agree.

- fa73225: fix(useMediaQuery): evict the shared `MediaQueryList` cache by LRU instead of dropping it whole

    The cache that `useMediaQuery`, `useBreakpoint`, `usePrefersColorScheme` and `usePrefersReducedMotion` share was cleared entirely once it reached 200 entries — including lists that live components were still subscribed to. Those listeners stay attached to the discarded object while every later snapshot read builds and reads a _second_ `MediaQueryList` for the same query, so an app that rotates through many queries quietly accumulated a duplicate list per subscribed query.

    Entries are now evicted one at a time, least-recently-used first, and only when nothing is subscribed to them. A query with live subscribers is never evicted, so a component keeps the list it is listening to for as long as it is mounted.

- fa73225: fix(useIndexedDB, useIndexedDBCollection, useFormCrashRecovery): a read whose transaction aborts no longer hangs forever

    `idbGet` listened only to its own request. A transaction can abort without any request reporting an error — the database closing under it, or another tab's version upgrade taking it down — and in that case neither `onsuccess` nor `onerror` ever fired, so the promise never settled: `await` never returned, and `useIndexedDB` sat in `status: 'loading'` for the life of the page. Reads now go through the same transaction wrapper as every other operation, which settles on `oncomplete`, `onerror` and `onabort` alike. `idbSet` and `idbRemove` moved onto it too, so a write that throws synchronously (a non-cloneable value) now aborts its transaction instead of leaving it open.

## 1.10.6

### Patch Changes

- 7dbc9ad: feat(useAsyncQueue): warn in development when `concurrency` reconfigures a shared queue

    Passing `concurrency` alongside a `key` (or inside an `AsyncQueueProvider`) silently changes the limit for every other consumer of that queue and is never reverted on unmount. That now warns once per call site in development, so the cross-component effect is visible at the call site. Runtime behaviour is unchanged.

- 7dbc9ad: fix(useFormCrashRecovery): drop values that don't survive a structured clone in the `DataCloneError` fallback

    `stripNonCloneable` only removed functions and symbols and passed every other non-plain object through untouched, so a DOM element, `window`, or an event stored in the form values made the retry `idbPut` fail with the same `DataCloneError` — the draft was lost and the status went to `error`. Non-plain objects are now probed with `structuredClone` (with a prototype-tag fallback where it is unavailable, and a hard reject for DOM host objects) and dropped, by path, when they cannot be persisted. Clonable built-ins such as `Date`, `Map`, `Set`, `Blob`, and typed arrays are still kept.

## 1.10.5

### Patch Changes

- 8c52d1d: fix(useLocalStorage/useSessionStorage): re-read storage when a surviving store is resubscribed, so a same-tab write that bypassed the hook is no longer missed

## 1.10.4

### Patch Changes

- fe7d187: fix(usePolling): hiding the tab during the very first request no longer leaves `status: 'loading'` stuck — the paused hook falls back to `'idle'` (so a skeleton doesn't hang behind a hidden tab), and because the in-flight run was aborted, coming back starts a fresh request immediately instead of waiting out the interval.

## 1.10.3

### Patch Changes

- 5f457a3: fix(useFormCrashRecovery): `clear()` now re-enables persistence after a `QuotaExceededError` (or a `first-tab-wins` conflict) had stopped it — previously a single failed write disabled drafts for the lifetime of the hook, even though `clear()` is what frees the space.

## 1.10.2

### Patch Changes

- 028d30a: **`useScrollAnchor` ignored user scrolls made during a smooth `scrollToBottom()`.** `scrollToBottom({ behavior: 'smooth' })` opens a window (up to a second) in which the hook's `scroll` handler returns early, so the animation's own events don't get mistaken for user intent. Wheel, touch and key events cancelled only the post-prepend settle window, not that one — so a reader who scrolled up mid-animation was still reported as `isAtBottom: true`: the "jump to bottom" button never appeared, and every incoming message pinned them back to the bottom. User intent now ends the smooth-scroll window too, and re-evaluates the bottom state immediately.

## 1.10.1

### Patch Changes

- bf7cf42: fix(useFocusTrap): correct focus ownership and tabindex parsing

    - A container React has already removed from the DOM no longer holds the trap. Cleanup runs a tick after the removal, and during that gap the stale trap both blocked the layer below from guarding focus and still reported `isActive: true`. The top-most trap is now the highest one whose container is still in the document.
    - Changing `priority` on a live trap now re-orders it in place. It used to tear the trap down and rebuild it, which returned focus to the trigger and then re-ran initial focus — dragging the user back to the first field mid-dialog.
    - A `tabindex` the browser cannot parse (`""`, `"auto"`, `"1.5"`) is now ignored, per HTML's rules for parsing integers, instead of being read as `0` or `-1`. `<div tabindex="">` is no longer treated as a tab stop, and `<button tabindex="auto">` is no longer skipped.

## 1.10.0

### Minor Changes

- 95f25aa: Add `useFocusTrap` — confines Tab to a container and returns focus when it closes.

    Focus wrapping runs on sentinel nodes placed around the container rather than on intercepted `keydown`s, so the tab order stays the browser's own and content that becomes focusable after activation is picked up automatically. A `focusin`/`focusout` net catches focus that leaves by any other route — a click outside, a stray `.focus()`, or a removed node dropping focus to `<body>`. Traps stack the same way `useKeyboardScope` stacks shortcuts: the most recently activated trap owns focus and suspends the ones below it, with `priority` to override.

## 1.9.1

### Patch Changes

- 3fbcc00: Fix four correctness bugs found in a full review:

    - **`useIndexedDB`**: a read started before a write could settle after it and republish the pre-write value. Reads and writes now take a ticket, so only the newest one publishes.
    - **`useIndexedDBCollection`**: a burst of change notifications started overlapping cursor reads that could settle out of order, leaving the list showing stale records until the next change. Superseded reads are now discarded.
    - **`useIndexedDB` / `useIndexedDBCollection` / `useFormCrashRecovery`**: a failed database upgrade (blocked by another tab, quota, corruption) left a closed `IDBDatabase` in the connection cache, so every later operation on that database failed with `InvalidStateError` for the lifetime of the page. The cache is now cleared before the reopen, and a closed connection is detected and reopened instead of reused.
    - **`useTabLeader`**: on the Web Locks path a non-leader tab reported `status: 'pending'` forever instead of settling on `'follower'`, contradicting the documented contract that both mechanisms behave identically. It now settles correctly; `isLeader` and `onBecomeLeader`/`onBecomeFollower` are unchanged.

## 1.9.0

### Minor Changes

- c1e507e: Add `useSingleFlight` — runs an async function at most once at a time, so a double-clicked submit can't fire the request twice. Calls made while one is in flight are dropped by default (`mode: 'share'` hands them the running promise instead), `pending` comes back as state for binding `disabled`, and the lock is released on resolve, reject, and synchronous throw alike.

## 1.8.1

### Patch Changes

- ed8225e: Update the development toolchain: `eslint`, `typescript-eslint`, `prettier`, `publint`, `lint-staged`, `react`/`react-dom`, `react-hook-form` and the React types move to their latest in-range versions, and an `overrides` entry pins the `esbuild` used by `tsup` to `^0.28.2`, clearing GHSA-g7r4-m6w7-qqqr.

    No shipped code changed — this is build and lint tooling only. Every bundle stays within its size budget and the package's export map still resolves cleanly under `publint` and `attw`.

## 1.8.0

### Minor Changes

- 7bd5f34: Add `useBreakpoint`, `usePrefersColorScheme`, and `usePrefersReducedMotion`.

    - **`useBreakpoint(breakpoints, options?)`** — the name of the widest breakpoint the viewport satisfies, typed as the union of your own key names. Each entry becomes a `(min-width: …)` query, so the result agrees with your CSS rather than with `innerWidth` (which counts the scrollbar), and re-renders happen only when the viewport crosses a breakpoint, not on every pixel of a resize. Numbers are pixels, strings are CSS lengths; object literals can be passed inline without re-subscribing.
    - **`usePrefersColorScheme(options?)`** — `'light' | 'dark'` from the system preference.
    - **`usePrefersReducedMotion(options?)`** — the accessibility setting, for the motion that lives in JavaScript rather than in CSS.

    All three are SSR-safe with a `serverFallback` option, and share the `MediaQueryList` cache with `useMediaQuery`.

## 1.7.1

### Patch Changes

- 1c6e04c: Fix a leaked IndexedDB connection after a blocked upgrade, affecting `useIndexedDB`, `useIndexedDBCollection` and `useFormCrashRecovery`.

    Creating a store or an index bumps the database version, and another tab holding the database open blocks that upgrade. The blocked open was reported as a failure — correctly — but rejecting a promise cannot cancel an `IDBOpenDBRequest`, and IndexedDB offers no way to cancel one. So when the other tab eventually closed, the upgrade went through anyway and handed back a connection nothing held a reference to. Being unreachable, it could never be closed, and it blocked every subsequent upgrade of that database for the rest of the page's life — turning one transient conflict into a permanent one. Such a connection is now closed as soon as it arrives.

- 1c6e04c: **`useLocalStorage` / `useSessionStorage` hand back a stable `setValue` again when `serialize`/`deserialize` are passed inline.** Both were dependencies of the `useCallback`, and options are normally written as an object literal — so a custom serializer was a fresh function on every render, `setValue` changed identity every render, and any memoized child or effect depending on it re-ran on every pass. They now live in refs, like the other option callbacks in this package; the latest one is still what gets called.

    **`useMediaQuery` no longer throws where `matchMedia` is unavailable.** Reading `window.matchMedia(query)` unguarded threw a `TypeError` in webviews and test environments that don't implement it, taking the render down with it. Such an environment now reports `false` and stays inert, and the hook picks the real API up if it appears later. The per-query cache is also bounded now, so an app deriving queries from a live value can't grow it without limit. The standalone import grows from 162 B to 222 B.

- 1c6e04c: Fix two stale-state bugs that only show up after the first mount.

    **`useOnlineStatus` (and `usePolling` with `pauseWhenOffline`) reported a stale network state after a remount.** The shared store outlives its subscribers, but its `online`/`offline` listeners are attached only while something is subscribed. So a connection that dropped while nothing was mounted was never observed, and the next mount kept reporting the old value until the browser happened to fire another event — a poller could stay parked as "offline" after the network came back, or hammer a dead network believing it was up. The store now re-reads `navigator.onLine` when it re-attaches.

    **`useScrollAnchor` could stop honoring user scrolls, leaving the view pinned to the anchor.** Scrolls the hook performs itself were tracked with a counter that assumed one scroll event per `scrollTop` assignment. Browsers coalesce several assignments made in the same frame into a single event — which `handleMutations` and a resize can easily produce — so the counter drifted upward, and each surplus count swallowed a real user scroll. A swallowed scroll never released the post-prepend settle window, so the next content resize yanked the reader back to the anchor. Programmatic scrolls are now recognised by the position they land on rather than by counting events, which is exact under coalescing and self-correcting when an assignment can't reach its target.

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

---
'react-kithooks': minor
---

Add `useThrottledValue` and `useThrottledCallback`, and split `useAbortableFetch`'s loading state.

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

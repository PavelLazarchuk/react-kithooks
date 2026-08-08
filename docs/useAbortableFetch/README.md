# useAbortableFetch

Runs an abortable async fetcher on mount and whenever deps change — aborting the previous call and ignoring any response that arrives after it was superseded.

```ts
import { useAbortableFetch } from 'react-kithooks/useAbortableFetch';
```

## The problem

```tsx
useEffect(() => {
    fetch(`/api/users/${userId}`)
        .then(r => r.json())
        .then(setData);
}, [userId]);
```

Switch users quickly and the request for user 1 can resolve _after_ the one for user 2 — overwriting fresh state with stale data. The UI now shows user 1's profile on user 2's page, and it only happens on slow or jittery networks, which is why it survives review.

Adding an `AbortController` helps but isn't sufficient: not every async source honors `AbortSignal` (a polyfilled fetch, an SDK method, a plain promise). This hook passes the signal _and_ tags each run with a request id — a superseded response is discarded even when the abort was ignored.

## Usage

```tsx
const { data, isLoading, error, refetch } = useAbortableFetch(
    signal => fetch(`/api/users/${userId}`, { signal }).then(r => r.json()),
    [userId]
);
```

A refresh that doesn't blank the page — `isLoading` is the first load, `isFetching` is any request in flight:

```tsx
const { data, isLoading, isFetching, refetch } = useAbortableFetch(
    signal => api.getInbox({ signal }),
    []
);

if (isLoading) return <Skeleton />; // only the first load

return (
    <>
        <button onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
        <List items={data} />
    </>
);
```

`refetch()` resolves when the request settles, so a control can await its own work:

```tsx
const onPullToRefresh = async () => {
    await refetch();
    haptics.tap();
};
```

Wait for a dependency:

```tsx
const { data, status } = useAbortableFetch(
    signal => api.getOrder(orderId!, { signal }),
    [orderId],
    { enabled: orderId != null }
);
```

Debounced search — one request per pause, and no stale result:

```tsx
const debouncedQuery = useDebouncedValue(query, 300);
const { data } = useAbortableFetch(
    signal => api.search(debouncedQuery, { signal }),
    [debouncedQuery]
);
```

## API

```ts
function useAbortableFetch<T>(
    fetcher: (signal: AbortSignal) => Promise<T>,
    deps: DependencyList,
    options?: UseAbortableFetchOptions
): UseAbortableFetchReturn<T>;
```

### Parameters

| Parameter | Type                                  | Description                                                                                    |
| --------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `fetcher` | `(signal: AbortSignal) => Promise<T>` | Your request. Pass the signal through so the network call is actually cancelled.               |
| `deps`    | `DependencyList`                      | Re-runs when these change, same semantics as `useEffect`. The latest `fetcher` is always used. |

### Options

| Option             | Type      | Default | Description                                                                               |
| ------------------ | --------- | ------- | ----------------------------------------------------------------------------------------- |
| `enabled`          | `boolean` | `true`  | When `false`, skips the fetcher and aborts anything in flight. Keeps what's on screen.    |
| `keepPreviousData` | `boolean` | `true`  | Keep `data` and `error` on screen while the next request runs. `false` clears them first. |

### Returns

| Field        | Type                                          | Description                                                                                            |
| ------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `data`       | `T \| undefined`                              | Last successful result. Kept while a new request runs, unless you opt out.                             |
| `error`      | `unknown`                                     | Last error. Aborts never appear here.                                                                  |
| `status`     | `'idle' \| 'loading' \| 'success' \| 'error'` | Request state. Stays `'success'` through a refetch — it describes what you have, not what's in flight. |
| `isLoading`  | `boolean`                                     | The **first** load: `status === 'loading'`, nothing to render yet.                                     |
| `isFetching` | `boolean`                                     | **Any** request in flight, including refetches and dep changes.                                        |
| `refetch`    | `() => Promise<void>`                         | Re-runs the fetcher, aborting any in-flight call first. Resolves when it settles.                      |
| `cancel`     | `() => void`                                  | Aborts the in-flight request and stops fetching, keeping whatever is on screen.                        |

## Notes

- **`isLoading` vs `isFetching`.** `isLoading` is true only while there is nothing to show — the first load, or any load after `keepPreviousData: false` cleared the data. `isFetching` is true whenever a request is in flight. Branch on the first for a skeleton and the second for a corner spinner; using `isLoading` for both is what makes a list flash empty on every refresh.
- **`refetch()` never rejects.** It resolves once the request settles, whether it succeeded or failed — read `status`/`error` for the outcome. That keeps `void refetch()` and `onClick={() => refetch()}` free of unhandled rejections. It also resolves if the run is superseded or cancelled, so an awaited `refetch()` can't hang forever.
- **`refetch()` returns a thenable**, so `act(() => refetch())` in a test now puts React's `act` into async mode. Use `act(() => void refetch())` where you don't intend to await it.
- **`cancel()` is not `enabled: false`.** It stops the current request and leaves the hook where it is; a later dep change or `refetch()` starts fetching again. `enabled: false` keeps it stopped. Cancelling never discards `data` — the last result stays, and `status` reverts to whatever that result made it.
- **A fetcher that throws synchronously is an error, not a crash** — it lands in `error` like any rejection instead of escaping into the effect.
- **A failed request keeps the last good `data`**, so a transient error doesn't blank the page. `status` becomes `'error'` alongside it, and a retry keeps that status until it resolves.
- The previous request is aborted on every dep change, on `refetch()`, on `cancel()`, and on unmount.
- **An `AbortError` never surfaces as `'error'`** — cancelling is expected behavior, not a failure, so it doesn't paint an error state.
- `fetcher` is read from a ref, so it doesn't need to be memoized — only `deps` controls re-running. That also means **everything the fetcher reads must be in `deps`**, exactly like `useEffect`.
- **`deps` must have the same length on every render.** A conditionally built array silently stops re-running the fetcher on the entries React can no longer see; use a stable placeholder (`null`) instead of adding or removing one. In development the hook warns by name when the length changes.
- **`keepPreviousData` is on by default**, so paging through a list doesn't blank it out between pages — the trade-off is that `data` briefly belongs to the _previous_ deps, which `isFetching` tells you. Set it to `false` when showing yesterday's record under today's id would be wrong; `data`, `error` and `status` then reset on every new request, `refetch()` included.
- This is a fetch-on-render primitive, not a cache. If you need shared caching, deduplication, or revalidation, use TanStack Query or SWR — this hook is for the cases where a full data layer is more than you need.

## Related

- [useDebouncedValue](../useDebouncedValue/README.md) — cut the number of requests before they're made.
- [useAsyncQueue](../useAsyncQueue/README.md) — for writes, where ordering matters more than cancellation.

## SSR

`status` server-renders as `'idle'` with `isFetching: false`; the fetcher only runs in an effect.

---

[← All hooks](../../README.md)

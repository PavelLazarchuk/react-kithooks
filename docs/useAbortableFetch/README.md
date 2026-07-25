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

| Option    | Type      | Default | Description                                                                            |
| --------- | --------- | ------- | -------------------------------------------------------------------------------------- |
| `enabled` | `boolean` | `true`  | When `false`, skips the fetcher and aborts anything in flight; `status` goes `'idle'`. |

### Returns

| Field       | Type                                          | Description                                                  |
| ----------- | --------------------------------------------- | ------------------------------------------------------------ |
| `data`      | `T \| undefined`                              | Last successful result. Kept while a new request is loading. |
| `error`     | `unknown`                                     | Last error. Aborts never appear here.                        |
| `status`    | `'idle' \| 'loading' \| 'success' \| 'error'` | Request state.                                               |
| `isLoading` | `boolean`                                     | `status === 'loading'`                                       |
| `refetch`   | `() => void`                                  | Re-runs the fetcher, aborting any in-flight call first.      |

## Notes

- **An `AbortError` never surfaces as `'error'`** — cancelling is expected behavior, not a failure, so it doesn't paint an error state.
- The previous request is aborted on every dep change, on `refetch()`, and on unmount.
- `fetcher` is read from a ref, so it doesn't need to be memoized — only `deps` controls re-running. That also means **everything the fetcher reads must be in `deps`**, exactly like `useEffect`.
- **`deps` must have the same length on every render.** A conditionally built array silently stops re-running the fetcher on the entries React can no longer see; use a stable placeholder (`null`) instead of adding or removing one. In development the hook warns by name when the length changes.
- `data` is not cleared while a new request loads, so lists don't blank out between pages. Branch on `status` if you want a hard loading state.
- This is a fetch-on-render primitive, not a cache. If you need shared caching, deduplication, or revalidation, use TanStack Query or SWR — this hook is for the cases where a full data layer is more than you need.

## Related

- [useDebouncedValue](../useDebouncedValue/README.md) — cut the number of requests before they're made.
- [useAsyncQueue](../useAsyncQueue/README.md) — for writes, where ordering matters more than cancellation.

## SSR

`status` server-renders as `'idle'`; the fetcher only runs in an effect.

---

[← All hooks](../../README.md)

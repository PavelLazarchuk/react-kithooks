# usePolling

Polls an endpoint on an interval — without overlapping ticks, without hammering a hidden tab or a dead network, and with backoff when the endpoint starts failing.

```ts
import { usePolling } from 'react-kithooks/usePolling';
```

## The problem

```tsx
useEffect(() => {
    const id = setInterval(() => {
        fetch(`/api/jobs/${jobId}`)
            .then(r => r.json())
            .then(setJob);
    }, 5000);

    return () => clearInterval(id);
}, [jobId]);
```

Four things go wrong, none of them on a fast network with a healthy server:

- **Ticks overlap.** When a request takes longer than the interval, the next one starts anyway. Now two responses race, and the slower one — carrying older data — can land last and win.
- **Hidden tabs keep polling.** A background tab nobody is looking at keeps billing your server every 5 seconds, all day. And when the user comes back, they stare at stale data for a full interval before it refreshes.
- **Offline means a failed request every tick.** The interval keeps firing into a dead network, burning battery and filling your error tracker.
- **A failing endpoint gets hammered.** When the server starts 500ing, every open tab retries at full rate forever, in lockstep — exactly when it can least afford it.

This hook fixes all four, and tags every run the same way [useAbortableFetch](../useAbortableFetch/README.md) does, so a superseded response can never overwrite a fresher one.

## Usage

```tsx
const { data, isLoading, isPaused } = usePolling(
    signal => fetch(`/api/jobs/${jobId}`, { signal }).then(r => r.json()),
    [jobId],
    { intervalMs: 5000 }
);
```

Stop once the work is done:

```tsx
const { data } = usePolling(signal => api.getJob(jobId, { signal }), [jobId], {
    intervalMs: 2000,
    enabled: job?.status !== 'finished',
});
```

Data already loaded on the server — poll for updates, but don't re-fetch on mount:

```tsx
const { data = initialData } = usePolling(signal => api.getFeed({ signal }), [], {
    intervalMs: 30_000,
    immediate: false,
});
```

Tell the user why nothing is updating:

```tsx
function JobStatus({ jobId }: { jobId: string }) {
    const { data, isPaused, failureCount } = usePolling(
        signal => api.getJob(jobId, { signal }),
        [jobId],
        { intervalMs: 5000 }
    );

    return (
        <>
            <JobCard job={data} />
            {isPaused && <span>Paused — reconnecting…</span>}
            {failureCount > 2 && <span>Can't reach the server. Retrying…</span>}
        </>
    );
}
```

## API

```ts
function usePolling<T>(
    poller: (signal: AbortSignal) => Promise<T>,
    deps: DependencyList,
    options?: UsePollingOptions
): UsePollingReturn<T>;
```

### Parameters

| Parameter | Type                                  | Description                                                                      |
| --------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| `poller`  | `(signal: AbortSignal) => Promise<T>` | One tick. Pass the signal through so a superseded request is actually cancelled. |
| `deps`    | `DependencyList`                      | Restarts the loop when these change, same semantics as `useEffect`.              |

### Options

| Option             | Type      | Default  | Description                                                                        |
| ------------------ | --------- | -------- | ---------------------------------------------------------------------------------- |
| `intervalMs`       | `number`  | `5000`   | Gap between the end of one tick and the start of the next.                         |
| `enabled`          | `boolean` | `true`   | When `false`, the loop is off and anything in flight is aborted.                   |
| `immediate`        | `boolean` | `true`   | Poll right away on mount and on every `deps` change, instead of after a full wait. |
| `pauseOnHidden`    | `boolean` | `true`   | Pause while the tab is hidden; refresh on return if a tick came due meanwhile.     |
| `pauseWhenOffline` | `boolean` | `true`   | Pause while the browser reports offline; resume on reconnect.                      |
| `backoff`          | `boolean` | `true`   | Back off exponentially (with jitter) on consecutive failures.                      |
| `maxBackoffMs`     | `number`  | `30_000` | Ceiling for the backoff delay.                                                     |

### Returns

| Field          | Type                                          | Description                                                                    |
| -------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| `data`         | `T \| undefined`                              | Last successful result. Kept across failures, cleared when `deps` change.      |
| `error`        | `unknown`                                     | Last error. Aborts never appear here.                                          |
| `status`       | `'idle' \| 'loading' \| 'success' \| 'error'` | Outcome of the loop. `'loading'` only ever describes the **first** run.        |
| `isLoading`    | `boolean`                                     | `status === 'loading'` — first load, nothing to show yet.                      |
| `isFetching`   | `boolean`                                     | A request is in flight right now, background refreshes included.               |
| `isPaused`     | `boolean`                                     | Enabled, but suspended because the tab is hidden or the browser is offline.    |
| `failureCount` | `number`                                      | Consecutive failures. Back to `0` on the first success.                        |
| `refresh`      | `() => void`                                  | Poll now, resetting the backoff and the schedule. Works while paused/disabled. |

## Notes

- **Ticks never overlap.** The next tick is scheduled once the current one settles, so a slow endpoint stretches the cadence instead of stacking requests on top of each other. Every run is also tagged, so a response from a superseded run is discarded even when the abort was ignored.
- **`isLoading` vs `isFetching`.** `status` only goes `'loading'` on the first run — a spinner bound to `isLoading` won't blink over data that's already on screen every interval. Use `isFetching` for a subtle "refreshing" indicator.
- **`isPaused` is not `!enabled`.** Disabled is off; paused is on-but-suspended, and that distinction is what lets you render "Paused — offline" without lying when polling is deliberately off.
- **Coming back to a tab doesn't always re-poll.** On resume, the hook polls immediately only if a tick actually came due while it was away — flipping between two tabs for a few seconds won't fire a request per switch.
- **Backoff is jittered** between 50% and 100% of the computed delay, and never drops below `intervalMs`. Without jitter, every tab that lost the same endpoint retries in lockstep and the recovering server takes a synchronized wave.
- **`deps` must have the same length on every render**, exactly like `useAbortableFetch` — a conditionally built array silently stops restarting the loop. In development the hook warns by name when the length changes.
- `poller` is read from a ref, so it doesn't need memoizing — only `deps` controls restarting. That also means **everything the poller reads must be in `deps`**.
- **A `deps` change clears `data`.** A new key is a different resource, so the old value would be wrong rather than merely stale. This is the deliberate difference from [useAbortableFetch](../useAbortableFetch/README.md), which keeps it so paginated lists don't blank out.
- Changing `intervalMs` applies from the next scheduled tick; it doesn't reschedule a timer that's already pending.
- This is a polling primitive, not a cache. If you need shared caching, deduplication, or revalidation across components, use TanStack Query or SWR.

## Related

- [useOnlineStatus](../useOnlineStatus/README.md) — the connectivity signal this hook pauses on, exposed on its own.
- [useAbortableFetch](../useAbortableFetch/README.md) — the one-shot version: fetch on deps change, no interval.
- [useAsyncQueue](../useAsyncQueue/README.md) — for writes, where ordering matters more than freshness.

## SSR

`status` server-renders as `'idle'` and `isPaused` as `false`; the loop only starts in an effect.

---

[← All hooks](../../README.md)

# useSingleFlight

Runs an async function at most once at a time — the rest of the clicks do nothing.

```ts
import { useSingleFlight } from 'react-kithooks/useSingleFlight';
```

## The problem

A submit button stays enabled for the whole round trip, so a double-click sends the order twice. The usual patch is a `useState` flag set before the call and cleared in a `finally` — which is right until the call rejects on one path that forgets the `finally`, or the component unmounts mid-flight and React is asked to set state on it.

Neither a queue nor a debounce is that guard. `useAsyncQueue` at `concurrency: 1` **serializes** the second call — the form still submits twice, just in order. A debounce limits how often calls _start_; it knows nothing about whether one is still running, so a 300ms debounce plus a 900ms request still lets three requests overlap.

This hook holds a lock for the lifetime of the promise, releases it on both settle paths, and hands back `pending` as state so the button can just bind `disabled` to it.

## Usage

```tsx
const [submit, { pending }] = useSingleFlight(async (data: FormData) => api.save(data));

<button onClick={() => submit(data)} disabled={pending}>
    {pending ? 'Saving…' : 'Save'}
</button>;
```

If a call can hang forever, `cancel()` gives the lock back so the button becomes clickable again:

```tsx
const [submit, { pending, cancel }] = useSingleFlight(save);

useEffect(() => {
    if (!pending) return;

    const timer = setTimeout(cancel, 30_000);

    return () => clearTimeout(timer);
}, [pending, cancel]);
```

For an idempotent read where every caller wants the same answer, share the in-flight call instead of dropping it:

```tsx
const [refresh] = useSingleFlight(() => api.getProfile(), { mode: 'share' });

const profile = await refresh(); // three components, one request
```

## API

```ts
function useSingleFlight<Args extends unknown[], T>(
    fn: (...args: Args) => Promise<T>,
    options?: UseSingleFlightOptions
): [(...args: Args) => Promise<T | undefined>, SingleFlightControls];
```

### Parameters

| Parameter | Type                      | Description                                          |
| --------- | ------------------------- | ---------------------------------------------------- |
| `fn`      | `(...args) => Promise<T>` | The async function to guard. Doesn't need memoizing. |

### Options

| Option | Type                | Default  | Description                                              |
| ------ | ------------------- | -------- | -------------------------------------------------------- |
| `mode` | `'drop' \| 'share'` | `'drop'` | What a call made while one is in flight does. See below. |

| Mode      | The call in flight wins by…                                                           | Return type of a blocked call |
| --------- | ------------------------------------------------------------------------------------- | ----------------------------- |
| `'drop'`  | discarding the new call entirely — `fn` is not invoked, its args are thrown away      | `Promise<undefined>`          |
| `'share'` | handing back the running promise — every caller resolves (or rejects) with its result | `Promise<T>`                  |

With `mode: 'share'` the returned signature narrows to `Promise<T>`, since no call ever comes back empty.

### Returns

A tuple:

| Member             | Type                                   | Description                                         |
| ------------------ | -------------------------------------- | --------------------------------------------------- |
| `run`              | `(...args) => Promise<T \| undefined>` | Stable identity for the component's lifetime.       |
| `controls.pending` | `boolean`                              | Whether a call is in flight. State — it re-renders. |
| `controls.cancel`  | `() => void`                           | Releases the lock by hand. Stable identity.         |

## Notes

- **`'drop'` is the default because it's the safe one for mutations.** Sharing a mutation would tell the second caller its data was saved when only the first caller's payload was ever sent.
- **A dropped call resolves to `undefined`, it does not reject** — `await submit(data)` on the second click simply produces nothing. If you need to tell "dropped" from "returned nothing", check `pending` before calling, or use `'share'`.
- **A rejection propagates and releases the lock**, so the next click retries. In `'share'` mode every caller of the shared call sees the same rejection — attach a handler to each returned promise or you'll get unhandled rejections.
- **A synchronous throw from `fn` rejects the returned promise and takes no lock**, so a bug in argument handling can't wedge the button permanently.
- **`fn` is read from a ref**, so `run` never goes stale and is safe in effect deps or a memoized child.
- **Only args of the first call are used** in `'share'` mode — that's why it fits reads, not writes.
- **The lock is per hook instance.** Two components each calling their own `useSingleFlight` can still run at the same time; for a guard shared across the tree, reach for [useAsyncQueue](../useAsyncQueue/README.md) with a key.
- **`cancel()` releases the lock, it does not abort the call.** It exists for the promise that never settles — a request behind a dead connection, a socket the server never answers — where the button would otherwise stay disabled forever. `pending` goes back to `false` and the next call runs immediately; the abandoned promise still settles for whoever awaited it, and when it does it touches neither `pending` nor the lock the newer call now holds. In `'share'` mode a cancelled promise stops being handed to new callers. To actually stop the work, cancel an `AbortController` of your own alongside it.
- **Unmounting mid-flight** doesn't cancel anything — the promise still settles for whoever awaited it, but no state is set afterwards. To actually abort the request, pair with [useAbortableFetch](../useAbortableFetch/README.md) or your own `AbortController`.

## Related

- [useAsyncQueue](../useAsyncQueue/README.md) — when the second call must still happen, just not concurrently.
- [useDebouncedCallback](../useDebouncedCallback/README.md) — when the limit is on how often calls start, not on overlap.
- [useAbortableFetch](../useAbortableFetch/README.md) — for the read-side race, where the newest call should win instead of the oldest.

## SSR

No DOM access. Renders with `pending: false` and never invokes `fn` on the server.

---

[← All hooks](../../README.md)

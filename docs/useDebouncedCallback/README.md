# useDebouncedCallback

A debounced function with a stable identity that always calls the latest `fn`.

```ts
import { useDebouncedCallback } from 'react-kithooks/useDebouncedCallback';
```

## The problem

`useCallback(debounce(fn, 500), [])` closes over the first render's props and state forever — the save fires 500ms later with values from before the user typed. Add the deps to fix the staleness and the debounced function is recreated on every render, so its timer resets each time and it never fires at all. Wrap it differently and you get a handler that fires into an unmounted component, the classic setState-after-unmount bug.

This hook keeps one identity for the component's lifetime while reading `fn` and `delayMs` from refs, so neither problem exists.

There's a third hole, in every plain debounce: while calls keep arriving faster than `delayMs`, `fn` runs **never**. An autosave debounced at 500ms saves nothing at all while someone types steadily for two minutes. `maxWaitMs` caps that starvation.

## Usage

```tsx
const save = useDebouncedCallback((draft: Draft) => api.save(draft), 500);

<input onChange={e => save({ ...draft, title: e.target.value })} onBlur={save.flush} />;
```

Autosave at least every 5 seconds, no matter how continuously someone types:

```tsx
const save = useDebouncedCallback((draft: Draft) => api.save(draft), 500, { maxWaitMs: 5_000 });
```

Safe in effect deps and memoized children, because its identity never changes:

```tsx
useEffect(() => {
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
}, [onResize]); // never re-subscribes
```

## API

```ts
function useDebouncedCallback<Args extends unknown[]>(
    fn: (...args: Args) => void,
    delayMs: number,
    options?: UseDebouncedCallbackOptions
): DebouncedCallback<Args>;
```

### Parameters

| Parameter | Type                      | Description                                                      |
| --------- | ------------------------- | ---------------------------------------------------------------- |
| `fn`      | `(...args: Args) => void` | The function to debounce. Doesn't need memoizing.                |
| `delayMs` | `number`                  | Quiet period before it fires. Applies from the next call onward. |

### Options

| Option      | Type     | Default | Description                                                                                  |
| ----------- | -------- | ------- | -------------------------------------------------------------------------------------------- |
| `maxWaitMs` | `number` | —       | Longest `fn` may go un-called while calls keep arriving. Omit for a plain trailing debounce. |

### Returns

A callable with methods:

| Member        | Type                      | Description                                                     |
| ------------- | ------------------------- | --------------------------------------------------------------- |
| `(...args)`   | `(...args: Args) => void` | Schedules a call, restarting the window and replacing the args. |
| `flush()`     | `() => void`              | Runs the pending call immediately. No-op if nothing is pending. |
| `cancel()`    | `() => void`              | Drops the pending call.                                         |
| `isPending()` | `() => boolean`           | Whether a call is waiting to fire.                              |

## Notes

- **Trailing edge only** — it fires after the pause, never immediately on the first call.
- When it fires it uses the **latest** `fn` and the args of the **last** call.
- **`maxWaitMs` is measured from the first call of a run**, not from the last one — that's what makes it a ceiling rather than a second debounce. A run ends when `fn` fires (including via `flush()`) or when `cancel()` drops it, and the next run starts its own deadline.
- `maxWaitMs` below `delayMs` effectively replaces the delay: the deadline always wins, since the wait used is the smaller of the two.
- Pending calls are cancelled on unmount. If the work must survive (an autosave on the way out), call `flush()` in a cleanup before the component goes.
- `isPending()` reads a ref, so it doesn't re-render on its own — use it inside handlers or with your own state for a "unsaved changes" indicator.

## Related

- [useDebouncedValue](../useDebouncedValue/README.md) — debounce a value instead of a call.
- [useThrottledCallback](../useThrottledCallback/README.md) — for a handler that must run _during_ a stream (scroll, pointer move), not after it stops.
- [useAsyncQueue](../useAsyncQueue/README.md) — pair with it so the saves that do go out can't land out of order.

## SSR

No DOM access; safe to create on the server, and nothing fires there.

---

[← All hooks](../../README.md)

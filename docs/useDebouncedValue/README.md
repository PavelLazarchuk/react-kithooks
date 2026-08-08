# useDebouncedValue

Returns a value once it has stopped changing for `delayMs`.

```ts
import { useDebouncedValue } from 'react-kithooks/useDebouncedValue';
```

## The problem

Every app rewrites this one, and most rewrites have the same two holes: a pending `setState` firing after the component unmounted, and — subtler — an update still firing when the value came back to where it started. Type "abc", delete it within the window, and the naive version publishes the original value again, re-triggering whatever depends on it (a search request, an effect, a re-render of a heavy list) for a value that never actually changed.

This one compares against the currently returned value, so type-and-undo produces no update at all.

There's a third hole, in every plain debounce: while the value keeps changing faster than `delayMs`, the update never happens **at all**. Someone typing steadily into a search box sees no results until they stop. `maxWaitMs` caps that starvation.

## Usage

```tsx
const [query, setQuery] = useState('');
const debouncedQuery = useDebouncedValue(query, 300);

// one request per pause in typing:
const { data } = useAbortableFetch(
    signal => api.search(debouncedQuery, { signal }),
    [debouncedQuery]
);
```

Guarantee results at least twice a second, however long someone types without pausing:

```tsx
const debouncedQuery = useDebouncedValue(query, 300, { maxWaitMs: 500 });
```

With `controls`, for a spinner and an explicit "search now":

```tsx
const { value, isPending, flush, cancel } = useDebouncedValue(query, 300, { controls: true });

<input
    value={query}
    onChange={e => setQuery(e.target.value)}
    onKeyDown={e => {
        if (e.key === 'Enter') flush(); // search now, don't wait out the window
        if (e.key === 'Escape') cancel(); // keep showing the current results
    }}
/>;
{
    isPending && <Spinner />;
} // results below are stale — a new query is coming
```

## API

```ts
function useDebouncedValue<T>(value: T, delayMs: number, options?: UseDebouncedValueOptions): T;

function useDebouncedValue<T>(
    value: T,
    delayMs: number,
    options: UseDebouncedValueControlsOptions
): DebouncedValue<T>;
```

### Parameters

| Parameter | Type     | Description                                     |
| --------- | -------- | ----------------------------------------------- |
| `value`   | `T`      | The value to debounce.                          |
| `delayMs` | `number` | Quiet period before the new value is published. |

### Options

| Option      | Type     | Default | Description                                                                                        |
| ----------- | -------- | ------- | -------------------------------------------------------------------------------------------------- |
| `maxWaitMs` | `number` | —       | Longest the value may go un-published while it keeps changing. Omit for a plain trailing debounce. |
| `controls`  | `true`   | —       | Return `DebouncedValue<T>` instead of the bare value. Must be a literal, not a variable.           |

### Returns

Without `controls`: `T` — the last value that stayed put for `delayMs`. The first render returns `value` itself, undebounced.

With `controls: true`, a `DebouncedValue<T>`:

| Field       | Type         | Description                                                                                  |
| ----------- | ------------ | -------------------------------------------------------------------------------------------- |
| `value`     | `T`          | Same value the bare form returns.                                                            |
| `isPending` | `boolean`    | An update is scheduled — `value` is behind the input. The flag a "searching…" spinner needs. |
| `flush`     | `() => void` | Publishes the latest value now, cancelling the scheduled update.                             |
| `cancel`    | `() => void` | Drops the scheduled update. `value` stays where it is until the input changes again.         |

## Notes

- **Comparison is `Object.is`.** A new object or array literal counts as a change every render — debounce a primitive, or memoize the object first.
- The pending update is cancelled on unmount: no setState-after-unmount warnings.
- Changing `delayMs` restarts the pending window with the new delay.
- **`maxWaitMs` is measured from the first change of a run**, not from the last one — that's what makes it a ceiling rather than a second debounce. A run ends when the value is published or reverts to what's already returned, and the next run starts its own deadline.
- `maxWaitMs` below `delayMs` effectively replaces the delay: the deadline always wins, since the published wait is the smaller of the two.
- **`controls` is read as a literal type, so it must be written inline** — `{ controls: true }` at the call site, or an object typed as `UseDebouncedValueControlsOptions`. A plain `UseDebouncedValueOptions` variable always selects the bare-value form.
- **`isPending` costs nothing when you don't ask for it.** Without `controls` the hook renders exactly as before; the flag is derived from the value it already tracks, not from extra state.
- **`flush()` publishes even a cancelled value** — it means "use what's in the input now", so Escape-then-Enter searches the current text. It's a no-op when the published value is already current.
- **`cancel()` abandons the run, it doesn't freeze the hook.** The next change to `value` starts a fresh window, `maxWaitMs` deadline included.
- This debounces a **value**. To debounce a _side effect_ (a save, an analytics call), use [useDebouncedCallback](../useDebouncedCallback/README.md).

## Related

- [useDebouncedCallback](../useDebouncedCallback/README.md) — debounce a function instead.
- [useThrottledValue](../useThrottledValue/README.md) — for a value that must keep updating _during_ a stream (scroll, drag), not after it stops.
- [useAbortableFetch](../useAbortableFetch/README.md) — the usual consumer of a debounced query.

## SSR

Server-renders the current value.

---

[← All hooks](../../README.md)

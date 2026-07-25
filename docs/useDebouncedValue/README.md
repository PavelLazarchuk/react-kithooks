# useDebouncedValue

Returns a value once it has stopped changing for `delayMs`.

```ts
import { useDebouncedValue } from 'react-kithooks/useDebouncedValue';
```

## The problem

Every app rewrites this one, and most rewrites have the same two holes: a pending `setState` firing after the component unmounted, and — subtler — an update still firing when the value came back to where it started. Type "abc", delete it within the window, and the naive version publishes the original value again, re-triggering whatever depends on it (a search request, an effect, a re-render of a heavy list) for a value that never actually changed.

This one compares against the currently returned value, so type-and-undo produces no update at all.

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

## API

```ts
function useDebouncedValue<T>(value: T, delayMs: number): T;
```

### Parameters

| Parameter | Type     | Description                                     |
| --------- | -------- | ----------------------------------------------- |
| `value`   | `T`      | The value to debounce.                          |
| `delayMs` | `number` | Quiet period before the new value is published. |

### Returns

`T` — the last value that stayed put for `delayMs`. The first render returns `value` itself, undebounced.

## Notes

- **Comparison is `Object.is`.** A new object or array literal counts as a change every render — debounce a primitive, or memoize the object first.
- The pending update is cancelled on unmount: no setState-after-unmount warnings.
- Changing `delayMs` restarts the pending window with the new delay.
- This debounces a **value**. To debounce a _side effect_ (a save, an analytics call), use [useDebouncedCallback](../useDebouncedCallback/README.md) — it gives you `flush()` and `cancel()`, which a value can't.

## Related

- [useDebouncedCallback](../useDebouncedCallback/README.md) — debounce a function instead.
- [useAbortableFetch](../useAbortableFetch/README.md) — the usual consumer of a debounced query.

## SSR

Server-renders the current value.

---

[← All hooks](../../README.md)

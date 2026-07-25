# usePreviousValue

The previous **distinct** value — what it was before it last changed.

```ts
import { usePreviousValue } from 'react-kithooks/usePreviousValue';
```

## The problem

```tsx
const ref = useRef();
useEffect(() => {
    ref.current = value;
});
return ref.current;
```

This overwrites the ref on **every** commit, not on every change. So after any unrelated re-render — a parent updating, an unrelated state change — "previous" now equals the current value, and comparisons like `prev !== value` silently stop working. The transition you were watching for fires once, then never again, and only on components that happen to re-render.

This version only advances when the value actually changes (`Object.is`), so "previous" always means the value before the last real change.

## Usage

```tsx
const prevStatus = usePreviousValue(status);

if (prevStatus === 'loading' && status === 'error') showRetryToast();
```

Detecting direction of change:

```tsx
const prevCount = usePreviousValue(count);
const trend = prevCount === undefined ? 'flat' : count > prevCount ? 'up' : 'down';
```

## API

```ts
function usePreviousValue<T>(value: T): T | undefined;
```

### Parameters

| Parameter | Type | Description         |
| --------- | ---- | ------------------- |
| `value`   | `T`  | The value to track. |

### Returns

`T | undefined` — the value before the last change, or `undefined` until it has changed at least once.

## Notes

- Comparison is `Object.is`. A new object or array literal counts as a change every render — track a primitive (an id, a status) or memoize the object.
- Updated during render, not in an effect, so the value is already correct in the same render that sees the new `value` — no extra pass needed.
- `undefined` before the first change is a real signal, not a gap: it means "nothing has changed yet", which is usually the case you want to skip.

## Related

- [useIsFirstRender](../useIsFirstRender/README.md) — for "is this the initial render" rather than "what changed".

## SSR

Server-renders `undefined`.

---

[← All hooks](../../README.md)

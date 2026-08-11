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

Tracking an object that is rebuilt every render — compare by content, or by the one field the transition actually depends on:

```tsx
const prevUser = usePreviousValue(user, (a, b) => a.id === b.id);

if (prevUser && prevUser.id !== user.id) resetDraft();
```

## API

```ts
function usePreviousValue<T>(value: T, isEqual?: (previous: T, next: T) => boolean): T | undefined;
```

### Parameters

| Parameter | Type                                | Default     | Description                                                          |
| --------- | ----------------------------------- | ----------- | -------------------------------------------------------------------- |
| `value`   | `T`                                 | —           | The value to track.                                                  |
| `isEqual` | `(previous: T, next: T) => boolean` | `Object.is` | Returns `true` when the two count as the same value, i.e. no change. |

### Returns

`T | undefined` — the value before the last change, or `undefined` until it has changed at least once.

## Notes

- Comparison is `Object.is` by default. A new object or array literal then counts as a change every render, so "previous" would always equal the current value — track a primitive (an id, a status), memoize the object, or pass `isEqual`.
- **`isEqual` decides what a change is, not what gets returned.** Values it calls equal are folded together, and what you get back is the reference the hook was already holding — the first of that run, not the latest one that compared equal. That's the point: if `{ id: 1, label: 'a' }` and `{ id: 1, label: 'b' }` are "the same user", the previous _user_ is the object you last saw as a distinct user.
- `isEqual` is read on every render, so swapping it mid-life takes effect immediately. It's called during render — keep it pure and cheap.
- Updated during render, not in an effect, so the value is already correct in the same render that sees the new `value` — no extra pass needed.
- `undefined` before the first change is a real signal, not a gap: it means "nothing has changed yet", which is usually the case you want to skip.

## Related

- [useIsFirstRender](../useIsFirstRender/README.md) — for "is this the initial render" rather than "what changed".

## SSR

Server-renders `undefined`.

---

[← All hooks](../../README.md)

# useThrottledValue

Republishes a value at most once per window, while it keeps changing.

```ts
import { useThrottledValue } from 'react-kithooks/useThrottledValue';
```

## The problem

Debounce and throttle are not interchangeable, and the wrong one is the usual reason a "fixed" scroll handler still feels broken. A **debounced** scroll position updates only once the user stops scrolling — which is exactly the moment the UI no longer needs it. Nothing moves during the gesture, then everything jumps at the end.

Throttle is the tool for a continuous stream: it publishes _during_ the movement, at a rate you choose.

The hand-rolled version has one hole, and it's a bad one:

```ts
if (Date.now() - last < 100) return; // ← the final change is dropped forever
```

Whatever arrives inside the window is discarded, and the last change of a burst is almost always inside a window. So the value comes to rest one window behind reality and stays there: the progress bar that stops at 97%, the scroll indicator that never quite reaches the end. Here the trailing edge is not optional — the returned value always converges on the current one.

## Usage

```tsx
const [scrollY, setScrollY] = useState(0);
const throttledY = useThrottledValue(scrollY, 100);

// re-renders ~10x/second while scrolling, and always lands on the final position
<Header collapsed={throttledY > 80} />;
```

Once per animation frame, for anything driving layout or a transform:

```tsx
const smoothX = useThrottledValue(pointerX, 'frame');

<div style={{ transform: `translateX(${smoothX}px)` }} />;
```

With `controls`, for an explicit "publish now":

```tsx
const { value, isPending, flush } = useThrottledValue(zoom, 200, { controls: true });

<input type="range" value={zoom} onChange={onChange} onPointerUp={flush} />;
```

## API

```ts
function useThrottledValue<T>(
    value: T,
    interval: ThrottleInterval,
    options?: UseThrottledValueOptions
): T;

function useThrottledValue<T>(
    value: T,
    interval: ThrottleInterval,
    options: UseThrottledValueControlsOptions
): ThrottledValue<T>;
```

### Parameters

| Parameter  | Type                | Description                                                                    |
| ---------- | ------------------- | ------------------------------------------------------------------------------ |
| `value`    | `T`                 | The value to throttle.                                                         |
| `interval` | `number \| 'frame'` | Milliseconds between updates, or `'frame'` for one update per animation frame. |

### Options

| Option     | Type      | Default | Description                                                                              |
| ---------- | --------- | ------- | ---------------------------------------------------------------------------------------- |
| `leading`  | `boolean` | `true`  | Publish the first change immediately. With `false`, it waits out a window first.         |
| `controls` | `true`    | —       | Return `ThrottledValue<T>` instead of the bare value. Must be a literal, not a variable. |

### Returns

Without `controls`: `T` — the last published value. The first render returns `value` itself.

With `controls: true`, a `ThrottledValue<T>`:

| Field       | Type         | Description                                                                       |
| ----------- | ------------ | --------------------------------------------------------------------------------- |
| `value`     | `T`          | Same value the bare form returns.                                                 |
| `isPending` | `boolean`    | A newer value is being held back and will publish at the end of the window.       |
| `flush`     | `() => void` | Publishes the held value now and restarts the window. No-op when nothing is held. |
| `cancel`    | `() => void` | Drops the held value. `value` stays where it is until the input changes again.    |

## Notes

- **The last change always lands.** There is no `trailing: false` here, unlike [useThrottledCallback](../useThrottledCallback/README.md): a value that can be permanently one window stale isn't a throttled value, it's a bug.
- **Comparison is `Object.is`.** A new object or array literal counts as a change every render — throttle a primitive, or memoize the object first.
- **Changing back inside the window produces no update at all**, and doesn't leave a rate limit behind: the next real change publishes immediately.
- **`'frame'` doesn't tick in a background tab.** `requestAnimationFrame` is paused there, so the held value publishes when the tab is shown again. That's what you want for visual work and wrong for anything that must keep running — use a millisecond interval for that.
- On the server, and anywhere `requestAnimationFrame` is missing, `'frame'` falls back to a ~16ms timer.
- Changing `interval` applies from the next window; it doesn't reschedule one already running.
- The held update is dropped on unmount — no setState-after-unmount.
- **`isPending` costs nothing when you don't ask for it.** Without `controls` the hook renders exactly as before; the flag is derived from the value it already tracks.

## Related

- [useThrottledCallback](../useThrottledCallback/README.md) — throttle a function instead of a value.
- [useDebouncedValue](../useDebouncedValue/README.md) — for a stream you want to react to only after it _stops_ (search input, autosave).

## SSR

Server-renders the current value; nothing is scheduled there.

---

[← All hooks](../../README.md)

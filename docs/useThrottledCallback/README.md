# useThrottledCallback

A rate-limited function with a stable identity that always calls the latest `fn` — and never drops the last call.

```ts
import { useThrottledCallback } from 'react-kithooks/useThrottledCallback';
```

## The problem

The throttle everyone writes from memory:

```ts
let last = 0;
const onScroll = () => {
    if (Date.now() - last < 100) return;
    last = Date.now();
    update();
};
```

It drops the last event of every burst. The final `scroll` before the user stops always lands mid-window, so `update()` runs with a position that is up to 100ms stale and never corrects — the sticky header that ends up half-collapsed, the "load more" that doesn't fire at the bottom of the page. This hook keeps a trailing edge: the last call is always delivered.

Wrapping it for React adds two more holes. `useCallback(throttle(fn, 100), [])` freezes `fn` around the first render's props; recreating it each render restarts its window so it never settles. And a trailing call that fires after the component unmounted is the classic setState-after-unmount bug. This one is created once, reads `fn` from a ref, and cancels itself on unmount.

Finally, a ~16ms timer is not a frame. It drifts against the paint cycle, so it fires twice in one frame and not at all in the next, and a callback that measures the DOM mid-frame forces an extra layout. Pass `'frame'` and the window _is_ the frame.

## Usage

```tsx
const onScroll = useThrottledCallback(() => setY(window.scrollY), 100);

<div onScroll={onScroll} />;
```

Once per frame, for anything that reads layout or writes a style:

```tsx
const onPointerMove = useThrottledCallback((e: React.PointerEvent) => {
    el.current!.style.transform = `translateX(${e.clientX}px)`;
}, 'frame');
```

Rate-limit an outgoing request, without letting the final state go unsent:

```tsx
const report = useThrottledCallback((state: Cursor) => api.presence(state), 1_000);
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
function useThrottledCallback<Args extends unknown[]>(
    fn: (...args: Args) => void,
    interval: ThrottleInterval,
    options?: UseThrottledCallbackOptions
): ThrottledCallback<Args>;
```

### Parameters

| Parameter  | Type                      | Description                                                                |
| ---------- | ------------------------- | -------------------------------------------------------------------------- |
| `fn`       | `(...args: Args) => void` | The function to rate-limit. Doesn't need memoizing.                        |
| `interval` | `number \| 'frame'`       | Milliseconds between calls, or `'frame'` for one call per animation frame. |

### Options

| Option     | Type      | Default | Description                                                                            |
| ---------- | --------- | ------- | -------------------------------------------------------------------------------------- |
| `leading`  | `boolean` | `true`  | Call immediately on the first call of a burst. With `false`, the first call waits.     |
| `trailing` | `boolean` | `true`  | Deliver the last call made inside a window when it ends. With `false`, those are lost. |

### Returns

A callable with methods:

| Member        | Type                      | Description                                                                        |
| ------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| `(...args)`   | `(...args: Args) => void` | Calls `fn` now, or holds these args for the trailing edge.                         |
| `flush()`     | `() => void`              | Delivers the held call immediately and restarts the window. No-op if none is held. |
| `cancel()`    | `() => void`              | Drops the held call and reopens the leading edge.                                  |
| `isPending()` | `() => boolean`           | Whether a call is being held for the trailing edge.                                |

## Notes

- **The rate limit is one call per window**, counted from the last delivered call: a leading call at t=0 and a trailing one at t=`interval` is the maximum, not two calls back to back.
- When it fires it uses the **latest** `fn` and the args of the **last** call.
- **`leading: false, trailing: false` means `fn` can never fire.** The hook warns about that combination in development.
- **`'frame'` doesn't tick in a background tab.** `requestAnimationFrame` is paused there, so the held call runs when the tab is shown again — right for visual work, wrong for anything that must keep running. Use a millisecond interval for that.
- On the server, and anywhere `requestAnimationFrame` is missing, `'frame'` falls back to a ~16ms timer.
- Changing `interval` applies from the next window; it doesn't reschedule one already running.
- **`cancel()` resets the hook rather than freezing it** — the next call is a leading call again.
- Held calls are cancelled on unmount. If the work must survive, call `flush()` in a cleanup before the component goes.
- `isPending()` reads a ref, so it doesn't re-render on its own — use it inside handlers.

## Related

- [useThrottledValue](../useThrottledValue/README.md) — throttle a value instead of a call.
- [useDebouncedCallback](../useDebouncedCallback/README.md) — for a stream you want to react to only after it _stops_ (autosave, search).
- [useScrollAnchor](../useScrollAnchor/README.md) — for the specific case of a scroll container that must not jump.

## SSR

No DOM access; safe to create on the server, and nothing fires there.

---

[← All hooks](../../README.md)

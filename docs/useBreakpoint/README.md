# useBreakpoint

The name of the widest breakpoint the viewport currently satisfies. SSR-safe and hydration-safe.

```ts
import { useBreakpoint } from 'react-kithooks/useBreakpoint';
```

## The problem

The usual responsive hook tracks `window.innerWidth` through a `resize` listener:

```tsx
const [width, setWidth] = useState(window.innerWidth);
useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
}, []);
```

Three problems. It throws on the server. It re-renders the component on **every pixel** of a drag, when the answer you actually wanted changes maybe three times. And `innerWidth` is not what your CSS media queries measure — it includes the scrollbar, so the JavaScript branch and the CSS branch disagree on a ~15px band on desktop Windows and Linux, which is exactly where "it works on my machine" bugs come from.

Calling [useMediaQuery](../useMediaQuery/README.md) in a loop instead fixes the measurement but breaks the rules of hooks — the hook count changes whenever the breakpoint set does.

## Usage

```tsx
const bp = useBreakpoint({ sm: 640, md: 768, lg: 1024 });
// 'base' | 'sm' | 'md' | 'lg'

return bp === 'base' ? <BottomSheet /> : <Sidebar collapsed={bp === 'sm'} />;
```

Numbers are pixels; strings are passed through as CSS lengths, so this composes with a rem scale:

```tsx
const bp = useBreakpoint({ sm: '40rem', md: '48rem', lg: '64rem' });
```

Rename the "narrower than everything" case if `'base'` doesn't match your vocabulary:

```tsx
const bp = useBreakpoint({ sm: 640, lg: 1024 }, { base: 'xs' });
// 'xs' | 'sm' | 'lg'
```

## API

```ts
function useBreakpoint<T extends Breakpoints, Base extends string = 'base'>(
    breakpoints: T,
    options?: UseBreakpointOptions<T, Base>
): (keyof T & string) | Base;
```

### Parameters

| Parameter     | Type                               | Description                                                                                |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `breakpoints` | `Record<string, number \| string>` | Name → min-width. Numbers are pixels, strings are CSS lengths. Declare them **ascending**. |

### Options

| Option           | Type     | Default  | Description                                    |
| ---------------- | -------- | -------- | ---------------------------------------------- |
| `base`           | `string` | `'base'` | Returned when no breakpoint matches.           |
| `serverFallback` | `string` | `base`   | What the server and the hydration pass render. |

### Returns

The name of the widest matching breakpoint, or `base`. The return type is the union of your own key names — a typo in a comparison is a type error, not a branch that silently never runs.

## Notes

- **Re-renders only when the viewport crosses a breakpoint.** The value is a string, so dragging a window edge across 400 pixels inside one breakpoint produces zero renders — the whole reason to prefer this over a `resize` listener.
- Each entry becomes a `(min-width: …)` query, so the answer agrees with your CSS by construction, scrollbar included. Queries share the `MediaQueryList` cache with [useMediaQuery](../useMediaQuery/README.md), and all of them are subscribed under a single `useSyncExternalStore`.
- **Pass an object literal freely.** Its identity changes every render, so the hook keys its work on the breakpoints' _content_ instead — a fresh literal each render re-subscribes nothing.
- **The widest matching entry wins, decided by declaration order**, not by comparing values — that is what lets `'40rem'` and `640` coexist, since units can't be compared without a layout. Development warns if numeric values tell it you declared them out of order.
- Min-width only, matching the mobile-first convention. A query this doesn't cover — `max-width`, orientation, hover capability — is a direct [useMediaQuery](../useMediaQuery/README.md) call.
- Breakpoints that are shared across an app belong in a module constant rather than re-declared per component, so the names stay in one place — but that's for your own consistency, not for the hook's benefit.

## SSR

Server-renders `serverFallback` (default: the `base` name), then the real value applies right after hydration with no mismatch. Pick the fallback matching the majority of your first paints.

---

[← All hooks](../../README.md)

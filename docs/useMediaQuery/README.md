# useMediaQuery

Reactive `window.matchMedia(query).matches`, SSR-safe and hydration-safe.

```ts
import { useMediaQuery } from 'react-kithooks/useMediaQuery';
```

## The problem

```tsx
const [matches, setMatches] = useState(window.matchMedia(query).matches);
```

Throws on the server (`window` is undefined). Guard it with `typeof window` and you trade the crash for a hydration mismatch: the server renders one branch, the client another, React warns and — worse — can silently keep the server's markup.

Built on `useSyncExternalStore`, this hook makes the hydration pass deterministic: it renders `serverFallback`, then applies the real value immediately after, which React handles as a normal update rather than a mismatch.

## Usage

```tsx
const isDesktop = useMediaQuery('(min-width: 768px)');
const prefersReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
const isDark = useMediaQuery('(prefers-color-scheme: dark)');

return isDesktop ? <Sidebar /> : <BottomSheet />;
```

Pick the fallback that matches most of your first paints:

```tsx
const isDesktop = useMediaQuery('(min-width: 768px)', { serverFallback: true });
```

## API

```ts
function useMediaQuery(query: string, options?: UseMediaQueryOptions): boolean;
```

### Parameters

| Parameter | Type     | Description                                               |
| --------- | -------- | --------------------------------------------------------- |
| `query`   | `string` | Any media query string, as passed to `window.matchMedia`. |

### Options

| Option           | Type      | Default | Description                                    |
| ---------------- | --------- | ------- | ---------------------------------------------- |
| `serverFallback` | `boolean` | `false` | What the server and the hydration pass render. |

### Returns

`boolean` — whether the query currently matches.

## Notes

- **`serverFallback` costs a re-render when it's wrong.** Pick the value matching the majority of your first paints (usually `true` for a desktop-first app) to minimize post-hydration flicker.
- Layout that _must_ be correct on the very first paint belongs in CSS, not here — this hook is for behavior (which component to mount, whether to animate), not for hiding a mismatch.
- Falls back to the legacy `addListener`/`removeListener` API on Safari < 14, which lacks `MediaQueryList.addEventListener`.
- **One `MediaQueryList` per query string, built on first use and reused by every component reading that query** — `matchMedia()` is not re-run per render or per snapshot read. Each instance still subscribes for itself, so the list is dropped by nobody and listeners are cleaned up on unmount.
- Lists are cached for the lifetime of the page. That is a handful of objects for the handful of query literals an app uses; build queries from changing values (a width from a slider) and the cache grows with them — another reason to pass a stable string.
- Changing `query` re-subscribes and re-reads immediately — pass a stable string, not one rebuilt per render from unstable parts.

## SSR

Server-renders `serverFallback`, then the real value applies right after hydration with no mismatch.

---

[← All hooks](../../README.md)

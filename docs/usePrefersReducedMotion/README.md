# usePrefersReducedMotion

Whether the user has asked the system to minimize non-essential motion. SSR-safe and hydration-safe.

```ts
import { usePrefersReducedMotion } from 'react-kithooks/usePrefersReducedMotion';
```

## The problem

`(prefers-reduced-motion: reduce)` is easy to honor in CSS and easy to forget in JavaScript — and JavaScript is exactly where the motion that causes trouble lives: spring physics, scroll-jacking, auto-advancing carousels, confetti. None of that is reachable from a media query in a stylesheet.

Reading it by hand reintroduces the same SSR problem as any `matchMedia` call: `window` is undefined on the server, and guarding with `typeof window` trades the crash for a hydration mismatch.

## Usage

```tsx
const prefersReducedMotion = usePrefersReducedMotion();

<motion.div
    animate={{ x: 100 }}
    transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring' }}
/>;
```

Cut the motion, not the information:

```tsx
function Notifications() {
    const prefersReducedMotion = usePrefersReducedMotion();

    // Wrong — the user loses the notification entirely:
    //   {!prefersReducedMotion && <Toast />}

    // Right — same notification, no slide-in:
    return <Toast animation={prefersReducedMotion ? 'fade' : 'slide'} />;
}
```

## API

```ts
function usePrefersReducedMotion(options?: UsePrefersReducedMotionOptions): boolean;
```

### Options

| Option           | Type      | Default | Description                                    |
| ---------------- | --------- | ------- | ---------------------------------------------- |
| `serverFallback` | `boolean` | `false` | What the server and the hydration pass render. |

### Returns

`boolean` — `true` when the user has requested reduced motion.

## Notes

- This is a thin wrapper over [useMediaQuery](../useMediaQuery/README.md) on `(prefers-reduced-motion: reduce)`, and shares its `MediaQueryList` cache — reading it from twenty components calls `matchMedia` once.
- **It's an accessibility request, not a style preference.** For users with vestibular disorders, large transitions and parallax cause real nausea. Treat `true` as a requirement.
- The setting can change mid-session; the value is reactive, so a transition already described in terms of it updates on its own.
- Purely decorative motion that lives in CSS should be handled in CSS, in a `@media (prefers-reduced-motion: reduce)` block — it applies on the very first paint, before any JavaScript runs. This hook is for the motion CSS cannot reach.

## SSR

Server-renders `serverFallback` (default `false`), then the real value applies right after hydration with no mismatch.

---

[← All hooks](../../README.md)

---
'react-kithooks': minor
---

Add `useBreakpoint`, `usePrefersColorScheme`, and `usePrefersReducedMotion`.

- **`useBreakpoint(breakpoints, options?)`** — the name of the widest breakpoint the viewport satisfies, typed as the union of your own key names. Each entry becomes a `(min-width: …)` query, so the result agrees with your CSS rather than with `innerWidth` (which counts the scrollbar), and re-renders happen only when the viewport crosses a breakpoint, not on every pixel of a resize. Numbers are pixels, strings are CSS lengths; object literals can be passed inline without re-subscribing.
- **`usePrefersColorScheme(options?)`** — `'light' | 'dark'` from the system preference.
- **`usePrefersReducedMotion(options?)`** — the accessibility setting, for the motion that lives in JavaScript rather than in CSS.

All three are SSR-safe with a `serverFallback` option, and share the `MediaQueryList` cache with `useMediaQuery`.

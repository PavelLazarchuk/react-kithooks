# usePrefersColorScheme

The user's system color scheme — `'light'` or `'dark'`. SSR-safe and hydration-safe.

```ts
import { usePrefersColorScheme } from 'react-kithooks/usePrefersColorScheme';
```

## The problem

`window.matchMedia('(prefers-color-scheme: dark)').matches` throws on the server, and guarding it with `typeof window` produces a hydration mismatch — the one place a mismatch is most visible, because the wrong branch is an entire theme.

## Usage

```tsx
const scheme = usePrefersColorScheme();

return <ThemeProvider theme={scheme === 'dark' ? darkTheme : lightTheme}>{children}</ThemeProvider>;
```

The system preference is the _default_ for a user who hasn't chosen, not the theme itself. With a toggle, pair it with [useLocalStorage](../useLocalStorage/README.md):

```tsx
const system = usePrefersColorScheme();
const [preference, setPreference] = useLocalStorage<'system' | 'light' | 'dark'>('theme', 'system');

const theme = preference === 'system' ? system : preference;
```

That is the whole three-state theme switcher, and it keeps following the system while the user is on "system".

## API

```ts
function usePrefersColorScheme(options?: UsePrefersColorSchemeOptions): ColorScheme;
```

### Options

| Option           | Type                | Default   | Description                                    |
| ---------------- | ------------------- | --------- | ---------------------------------------------- |
| `serverFallback` | `'light' \| 'dark'` | `'light'` | What the server and the hydration pass render. |

### Returns

`'light' | 'dark'`.

## Notes

- Built on [useMediaQuery](../useMediaQuery/README.md), sharing its `MediaQueryList` cache — reading the scheme from twenty components calls `matchMedia` once.
- **Only the dark query is evaluated.** `no-preference` was dropped from the spec, so every engine that implements this at all reports one of the two, and light is the correct fallback for an engine that doesn't.
- Reactive: flipping the OS theme updates every reader without a reload.
- **A theme that must be right on the first paint needs a blocking inline script**, not a hook — any hook renders `serverFallback` first by construction. The usual fix is a small script in `<head>` that reads the stored preference and sets a `data-theme` attribute before paint; this hook then drives everything after hydration.

## SSR

Server-renders `serverFallback` (default `'light'`), then the real value applies right after hydration with no mismatch.

---

[← All hooks](../../README.md)

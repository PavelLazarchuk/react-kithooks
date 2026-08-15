import { useMediaQuery } from '../useMediaQuery';

export type ColorScheme = 'light' | 'dark';

export interface UsePrefersColorSchemeOptions {
    serverFallback?: ColorScheme;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * The user's system color scheme — `'dark'` or `'light'` — read through
 * useMediaQuery, so it is SSR-safe and hydration-safe.
 *
 * Only the dark query is evaluated: `no-preference` was dropped from the spec,
 * so every engine that implements this at all reports one of the two, and
 * light is what an engine without support should fall back to anyway.
 *
 * This is the *system* preference, which is the starting point for a theme,
 * not the theme itself. An app with a theme toggle should treat this as the
 * default for a user who has not chosen yet, and read the choice from
 * useLocalStorage once they have.
 */
export function usePrefersColorScheme(options?: UsePrefersColorSchemeOptions): ColorScheme {
    const serverFallback = options?.serverFallback ?? 'light';
    const isDark = useMediaQuery(DARK_QUERY, { serverFallback: serverFallback === 'dark' });

    return isDark ? 'dark' : 'light';
}

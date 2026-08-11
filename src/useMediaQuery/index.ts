import { useCallback, useSyncExternalStore } from 'react';

import { getMediaQueryList } from './store';

export interface UseMediaQueryOptions {
    serverFallback?: boolean;
}

/**
 * Reactive `window.matchMedia(query).matches`, SSR-safe: the naive
 * `useState(matchMedia(query).matches)` throws on the server and causes a
 * hydration mismatch on the client. Built on useSyncExternalStore, so the
 * hydration pass consistently renders `serverFallback` and the real value
 * applies right after — no mismatch error. Falls back to the legacy
 * `addListener` API on old Safari (< 14), which lacks
 * `MediaQueryList.addEventListener`.
 *
 * The `MediaQueryList` for a query is built once and reused by every instance
 * reading that query, rather than rebuilt on each render and each snapshot
 * read.
 */
export function useMediaQuery(query: string, options?: UseMediaQueryOptions): boolean {
    const serverFallback = options?.serverFallback ?? false;

    const subscribe = useCallback(
        (onChange: () => void) => {
            const mql = getMediaQueryList(query);

            if (typeof mql.addEventListener === 'function') {
                mql.addEventListener('change', onChange);

                return () => mql.removeEventListener('change', onChange);
            }

            // Safari < 14
            mql.addListener(onChange);

            return () => mql.removeListener(onChange);
        },
        [query]
    );

    const getSnapshot = useCallback(() => getMediaQueryList(query).matches, [query]);
    const getServerSnapshot = useCallback(() => serverFallback, [serverFallback]);

    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

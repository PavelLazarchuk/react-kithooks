import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

import { getMediaQueryList, subscribeToMediaQuery } from '../useMediaQuery/store';
import { isDev } from '../internal/isDev';

export type BreakpointValue = number | string;

export type Breakpoints = Record<string, BreakpointValue>;

export interface UseBreakpointOptions<T extends Breakpoints, Base extends string = 'base'> {
    base?: Base;
    serverFallback?: (keyof T & string) | NoInfer<Base>;
}

interface Entry {
    name: string;
    query: string;
}

function toQuery(value: BreakpointValue): string {
    return `(min-width: ${typeof value === 'number' ? `${value}px` : value})`;
}

function buildEntries(breakpoints: Breakpoints): Entry[] {
    return Object.entries(breakpoints).map(([name, value]) => ({ name, query: toQuery(value) }));
}

function useOrderWarning(breakpoints: Breakpoints, signature: string): void {
    const warnedRef = useRef<string | null>(null);

    if (!isDev || warnedRef.current === signature) return;

    warnedRef.current = signature;

    let previous = -Infinity;

    for (const [name, value] of Object.entries(breakpoints)) {
        if (typeof value !== 'number') {
            previous = -Infinity;
            continue;
        }

        if (value < previous) {
            console.warn(
                `[react-kithooks] useBreakpoint: breakpoints are declared out of order ` +
                    `("${name}: ${value}" comes after a wider one). The last matching entry ` +
                    `wins, so a narrower breakpoint declared later shadows every wider one. ` +
                    `List them ascending: { sm: 640, md: 768, lg: 1024 }.`
            );

            return;
        }

        previous = value;
    }
}

/**
 * The name of the widest breakpoint the viewport currently satisfies —
 * `'base'` when it satisfies none.
 *
 *   const bp = useBreakpoint({ sm: 640, md: 768, lg: 1024 });
 *   // 'base' | 'sm' | 'md' | 'lg'
 *
 * Each entry becomes a `(min-width: …)` query; numbers are read as pixels and
 * strings are passed through as CSS lengths (`'40rem'`), so this composes with
 * whatever scale your CSS already uses. Every query shares the
 * `MediaQueryList` cache with useMediaQuery, and all of them are subscribed
 * under a single `useSyncExternalStore` — the naive version calls
 * `useMediaQuery` in a loop, which changes the hook count whenever the
 * breakpoint set does and breaks the rules of hooks.
 *
 * The returned name is a string, so it re-renders only when the viewport
 * actually crosses a breakpoint, not on every resize event.
 *
 * The largest matching entry wins, decided by declaration order rather than by
 * comparing values — that is what lets `'40rem'` and `640` coexist, since
 * units can't be compared without a layout. Declare them ascending;
 * development warns if numeric values say you didn't.
 */
export function useBreakpoint<T extends Breakpoints, Base extends string = 'base'>(
    breakpoints: T,
    options?: UseBreakpointOptions<T, Base>
): (keyof T & string) | Base {
    const base = (options?.base ?? 'base') as Base;
    const serverFallback = options?.serverFallback ?? base;

    const signature = Object.entries(breakpoints)
        .map(([name, value]) => `${name}:${value}`)
        .join('|');

    useOrderWarning(breakpoints, signature);

    const entries = useMemo(
        () => buildEntries(breakpoints),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [signature]
    );

    const subscribe = useCallback(
        (onChange: () => void) => {
            const unsubscribes = entries.map(entry => subscribeToMediaQuery(entry.query, onChange));

            return () => {
                for (const unsubscribe of unsubscribes) unsubscribe();
            };
        },
        [entries]
    );

    const getSnapshot = useCallback(() => {
        let matched: string = base;

        for (const entry of entries) {
            if (getMediaQueryList(entry.query).matches) matched = entry.name;
        }

        return matched;
    }, [entries, base]);

    const getServerSnapshot = useCallback(() => serverFallback as string, [serverFallback]);

    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) as
        (keyof T & string) | Base;
}

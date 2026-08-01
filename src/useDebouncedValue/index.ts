import { useEffect, useRef, useState } from 'react';

export interface UseDebouncedValueOptions {
    maxWaitMs?: number;
}

/**
 * Returns `value`, but updates only after it has stopped changing for
 * `delayMs`. The pending update is cancelled when the value reverts to the
 * currently returned one within the window (type-and-undo produces no
 * update at all) and when the component unmounts (no setState after
 * unmount).
 *
 * `maxWaitMs` caps how long an update can be starved: a plain debounce
 * updates *never* while the value keeps changing faster than `delayMs`, so a
 * search box that someone types into continuously shows no results at all
 * until they pause. With it set, the value is committed at least that often.
 */
export function useDebouncedValue<T>(
    value: T,
    delayMs: number,
    options: UseDebouncedValueOptions = {}
): T {
    const { maxWaitMs } = options;

    const [debounced, setDebounced] = useState(value);
    const debouncedRef = useRef(debounced);
    const pendingSinceRef = useRef<number | null>(null);

    useEffect(() => {
        if (Object.is(debouncedRef.current, value)) {
            pendingSinceRef.current = null;

            return;
        }

        if (pendingSinceRef.current === null) pendingSinceRef.current = Date.now();

        const remaining =
            maxWaitMs === undefined
                ? delayMs
                : Math.max(0, pendingSinceRef.current + maxWaitMs - Date.now());

        const timer = setTimeout(
            () => {
                pendingSinceRef.current = null;
                debouncedRef.current = value;
                setDebounced(value);
            },
            Math.min(delayMs, remaining)
        );

        return () => clearTimeout(timer);
    }, [value, delayMs, maxWaitMs]);

    return debounced;
}

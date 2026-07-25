import { useEffect, useMemo, useRef } from 'react';

export interface DebouncedCallback<Args extends unknown[]> {
    (...args: Args): void;
    cancel: () => void;
    flush: () => void;
    isPending: () => boolean;
}

/**
 * Debounced version of `fn` with a stable identity across renders — safe to
 * put in effect deps or pass to memoized children. When it fires, it calls
 * the LATEST `fn` (no stale closure over old props/state), with the args of
 * the last call. Any pending invocation is cancelled on unmount — a
 * debounced handler firing into an unmounted component is the classic
 * source of setState-after-unmount bugs.
 */
export function useDebouncedCallback<Args extends unknown[]>(
    fn: (...args: Args) => void,
    delayMs: number
): DebouncedCallback<Args> {
    const fnRef = useRef(fn);
    fnRef.current = fn;
    const delayRef = useRef(delayMs);
    delayRef.current = delayMs;

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const argsRef = useRef<Args | null>(null);

    const debounced = useMemo<DebouncedCallback<Args>>(() => {
        const invoke = () => {
            timerRef.current = null;
            const args = argsRef.current;
            argsRef.current = null;

            if (args) fnRef.current(...args);
        };

        const call = (...args: Args) => {
            argsRef.current = args;

            if (timerRef.current !== null) clearTimeout(timerRef.current);

            timerRef.current = setTimeout(invoke, delayRef.current);
        };

        return Object.assign(call, {
            cancel: () => {
                if (timerRef.current === null) return;

                clearTimeout(timerRef.current);
                timerRef.current = null;
                argsRef.current = null;
            },
            flush: () => {
                if (timerRef.current === null) return;

                clearTimeout(timerRef.current);
                invoke();
            },
            isPending: () => timerRef.current !== null,
        });
    }, []);

    useEffect(() => () => debounced.cancel(), [debounced]);

    return debounced;
}

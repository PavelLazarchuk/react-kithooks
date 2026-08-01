import { useEffect, useMemo, useRef } from 'react';

export interface DebouncedCallback<Args extends unknown[]> {
    (...args: Args): void;
    cancel: () => void;
    flush: () => void;
    isPending: () => boolean;
}

export interface UseDebouncedCallbackOptions {
    maxWaitMs?: number;
}

/**
 * Debounced version of `fn` with a stable identity across renders — safe to
 * put in effect deps or pass to memoized children. When it fires, it calls
 * the LATEST `fn` (no stale closure over old props/state), with the args of
 * the last call. Any pending invocation is cancelled on unmount — a
 * debounced handler firing into an unmounted component is the classic
 * source of setState-after-unmount bugs.
 *
 * `maxWaitMs` caps how long an invocation can be starved: a plain debounce
 * fires *never* while calls keep arriving faster than `delayMs`, so a
 * continuously-typed autosave saves nothing until the typing stops. With it
 * set, `fn` runs at least that often.
 */
export function useDebouncedCallback<Args extends unknown[]>(
    fn: (...args: Args) => void,
    delayMs: number,
    options: UseDebouncedCallbackOptions = {}
): DebouncedCallback<Args> {
    const fnRef = useRef(fn);
    fnRef.current = fn;
    const delayRef = useRef(delayMs);
    delayRef.current = delayMs;
    const maxWaitRef = useRef(options.maxWaitMs);
    maxWaitRef.current = options.maxWaitMs;

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const argsRef = useRef<Args | null>(null);
    const pendingSinceRef = useRef<number | null>(null);

    const debounced = useMemo<DebouncedCallback<Args>>(() => {
        const invoke = () => {
            timerRef.current = null;
            pendingSinceRef.current = null;
            const args = argsRef.current;
            argsRef.current = null;

            if (args) fnRef.current(...args);
        };

        const call = (...args: Args) => {
            argsRef.current = args;

            if (timerRef.current !== null) clearTimeout(timerRef.current);

            if (pendingSinceRef.current === null) pendingSinceRef.current = Date.now();

            const maxWaitMs = maxWaitRef.current;
            const remaining =
                maxWaitMs === undefined
                    ? delayRef.current
                    : Math.max(0, pendingSinceRef.current + maxWaitMs - Date.now());

            timerRef.current = setTimeout(invoke, Math.min(delayRef.current, remaining));
        };

        return Object.assign(call, {
            cancel: () => {
                if (timerRef.current === null) return;

                clearTimeout(timerRef.current);
                timerRef.current = null;
                argsRef.current = null;
                pendingSinceRef.current = null;
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

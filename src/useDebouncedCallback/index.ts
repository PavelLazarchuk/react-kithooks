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
    const { maxWaitMs } = options;

    const fnRef = useRef(fn);
    fnRef.current = fn;
    const delayRef = useRef(delayMs);
    delayRef.current = delayMs;
    const maxWaitRef = useRef(maxWaitMs);
    maxWaitRef.current = maxWaitMs;

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const argsRef = useRef<Args | null>(null);
    const pendingSinceRef = useRef<number | null>(null);
    const lastCallAtRef = useRef(0);
    const scheduleRef = useRef<() => void>(() => undefined);

    const debounced = useMemo<DebouncedCallback<Args>>(() => {
        const invoke = () => {
            timerRef.current = null;
            pendingSinceRef.current = null;
            const args = argsRef.current;
            argsRef.current = null;

            if (args) fnRef.current(...args);
        };

        const schedule = () => {
            if (timerRef.current !== null) clearTimeout(timerRef.current);

            const now = Date.now();
            const maxWait = maxWaitRef.current;
            const untilQuiet = lastCallAtRef.current + delayRef.current - now;
            const untilMaxWait =
                maxWait === undefined ? Infinity : (pendingSinceRef.current ?? now) + maxWait - now;

            timerRef.current = setTimeout(invoke, Math.max(0, Math.min(untilQuiet, untilMaxWait)));
        };

        scheduleRef.current = schedule;

        const call = (...args: Args) => {
            argsRef.current = args;
            lastCallAtRef.current = Date.now();

            if (pendingSinceRef.current === null) pendingSinceRef.current = lastCallAtRef.current;

            schedule();
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

    useEffect(() => {
        if (debounced.isPending()) scheduleRef.current();
    }, [debounced, delayMs, maxWaitMs]);

    useEffect(() => () => debounced.cancel(), [debounced]);

    return debounced;
}

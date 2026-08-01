import { useEffect, useMemo, useRef, useState } from 'react';

export interface UseDebouncedValueOptions {
    maxWaitMs?: number;
}

export interface UseDebouncedValueControlsOptions extends UseDebouncedValueOptions {
    controls: true;
}

export interface DebouncedValue<T> {
    value: T;
    isPending: boolean;
    flush: () => void;
    cancel: () => void;
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
 *
 * Pass `{ controls: true }` to get `{ value, isPending, flush, cancel }`
 * instead of the bare value — `isPending` is the "results are stale, a new
 * search is coming" flag a spinner needs, which cannot be derived outside the
 * hook once `flush`/`cancel` exist.
 */
export function useDebouncedValue<T>(
    value: T,
    delayMs: number,
    options?: UseDebouncedValueOptions & { controls?: false }
): T;
export function useDebouncedValue<T>(
    value: T,
    delayMs: number,
    options: UseDebouncedValueControlsOptions
): DebouncedValue<T>;
export function useDebouncedValue<T>(
    value: T,
    delayMs: number,
    options: UseDebouncedValueOptions & { controls?: boolean } = {}
): T | DebouncedValue<T> {
    const { maxWaitMs, controls = false } = options;

    const [debounced, setDebounced] = useState(value);
    const [cancelled, setCancelled] = useState(false);

    const debouncedRef = useRef(debounced);
    const cancelledRef = useRef(false);
    const valueRef = useRef(value);
    valueRef.current = value;
    const pendingSinceRef = useRef<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const commands = useMemo(() => {
        const clearTimer = () => {
            if (timerRef.current === null) return;

            clearTimeout(timerRef.current);
            timerRef.current = null;
        };

        const uncancel = () => {
            if (!cancelledRef.current) return;

            cancelledRef.current = false;
            setCancelled(false);
        };

        return {
            clearTimer,
            uncancel,
            flush: () => {
                clearTimer();
                pendingSinceRef.current = null;
                uncancel();

                const next = valueRef.current;

                if (Object.is(debouncedRef.current, next)) return;

                debouncedRef.current = next;
                setDebounced(next);
            },
            cancel: () => {
                clearTimer();
                pendingSinceRef.current = null;

                if (cancelledRef.current) return;
                if (Object.is(debouncedRef.current, valueRef.current)) return;

                cancelledRef.current = true;
                setCancelled(true);
            },
        };
    }, []);

    useEffect(() => {
        if (Object.is(debouncedRef.current, value)) {
            pendingSinceRef.current = null;

            return;
        }

        commands.uncancel();

        if (pendingSinceRef.current === null) pendingSinceRef.current = Date.now();

        const remaining =
            maxWaitMs === undefined
                ? delayMs
                : Math.max(0, pendingSinceRef.current + maxWaitMs - Date.now());

        timerRef.current = setTimeout(
            () => {
                timerRef.current = null;
                pendingSinceRef.current = null;
                debouncedRef.current = value;
                setDebounced(value);
            },
            Math.min(delayMs, remaining)
        );

        return () => commands.clearTimer();
    }, [value, delayMs, maxWaitMs, commands]);

    const isPending = !cancelled && !Object.is(debounced, value);

    const result = useMemo<DebouncedValue<T>>(
        () => ({ value: debounced, isPending, flush: commands.flush, cancel: commands.cancel }),
        [debounced, isPending, commands]
    );

    return controls ? result : debounced;
}

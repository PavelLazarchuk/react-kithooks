import { useEffect, useMemo, useRef } from 'react';

import { isDev } from '../internal/isDev';
import { scheduleThrottleWindow } from '../internal/throttleSchedule';
import type { ThrottleInterval } from '../internal/throttleSchedule';

export type { ThrottleInterval };

export interface UseThrottledCallbackOptions {
    leading?: boolean;
    trailing?: boolean;
}

export interface ThrottledCallback<Args extends unknown[]> {
    (...args: Args): void;
    cancel: () => void;
    flush: () => void;
    isPending: () => boolean;
}

/**
 * Rate-limits `fn` to at most one call per window, with a stable identity
 * across renders and no stale closure — it always calls the LATEST `fn`.
 *
 * Debounce is the wrong tool for a continuous stream (scroll, pointer move,
 * resize): it fires only after the stream stops, so nothing updates while the
 * user is actually moving. Throttle fires *during* it.
 */
export function useThrottledCallback<Args extends unknown[]>(
    fn: (...args: Args) => void,
    interval: ThrottleInterval,
    options: UseThrottledCallbackOptions = {}
): ThrottledCallback<Args> {
    const { leading = true, trailing = true } = options;

    const fnRef = useRef(fn);
    fnRef.current = fn;
    const intervalRef = useRef(interval);
    intervalRef.current = interval;
    const leadingRef = useRef(leading);
    leadingRef.current = leading;
    const trailingRef = useRef(trailing);
    trailingRef.current = trailing;

    const warnedRef = useRef(false);

    if (isDev && !leading && !trailing && !warnedRef.current) {
        warnedRef.current = true;
        console.warn(
            '[react-kithooks] useThrottledCallback: `leading` and `trailing` are both false, ' +
                'so the callback can never fire. Leave at least one edge enabled.'
        );
    }

    const argsRef = useRef<Args | null>(null);
    const closeWindowRef = useRef<(() => void) | null>(null);
    const windowStartRef = useRef(0);
    const rearmRef = useRef<() => void>(() => undefined);

    const throttled = useMemo<ThrottledCallback<Args>>(() => {
        function endWindow(): void {
            closeWindowRef.current = null;

            if (argsRef.current === null) return;

            if (trailingRef.current) invoke();
            else argsRef.current = null;
        }

        function armWindow(delay: ThrottleInterval): void {
            closeWindowRef.current = scheduleThrottleWindow(delay, endWindow);
        }

        function openWindow(): void {
            windowStartRef.current = Date.now();
            armWindow(intervalRef.current);
        }

        function invoke(): void {
            const args = argsRef.current;
            argsRef.current = null;

            openWindow();

            if (args) fnRef.current(...args);
        }

        function closeWindow(): void {
            closeWindowRef.current?.();
            closeWindowRef.current = null;
        }

        rearmRef.current = () => {
            if (closeWindowRef.current === null) return;

            closeWindow();

            const interval = intervalRef.current;

            if (interval === 'frame') {
                armWindow(interval);

                return;
            }

            const remaining = windowStartRef.current + interval - Date.now();

            if (remaining > 0) armWindow(remaining);
            else endWindow();
        };

        const call = (...args: Args) => {
            if (closeWindowRef.current !== null) {
                if (trailingRef.current) argsRef.current = args;

                return;
            }

            argsRef.current = args;

            if (leadingRef.current) invoke();
            else openWindow();
        };

        return Object.assign(call, {
            cancel: () => {
                closeWindow();
                argsRef.current = null;
            },
            flush: () => {
                if (argsRef.current === null) return;

                closeWindow();
                invoke();
            },
            isPending: () => argsRef.current !== null,
        });
    }, []);

    useEffect(() => {
        rearmRef.current();
    }, [interval]);

    useEffect(() => () => throttled.cancel(), [throttled]);

    return throttled;
}

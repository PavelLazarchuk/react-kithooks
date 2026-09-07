import { useEffect, useMemo, useRef, useState } from 'react';

import { scheduleThrottleWindow } from '../internal/throttleSchedule';
import type { ThrottleInterval } from '../internal/throttleSchedule';

export type { ThrottleInterval };

export interface UseThrottledValueOptions {
    leading?: boolean;
}

export interface UseThrottledValueControlsOptions extends UseThrottledValueOptions {
    controls: true;
}

export interface ThrottledValue<T> {
    value: T;
    isPending: boolean;
    flush: () => void;
    cancel: () => void;
}

/**
 * Republishes `value` at most once per window, while it keeps changing.
 *
 * The difference from `useDebouncedValue` is what happens *during* a
 * continuous stream: a debounced scroll position updates only once the user
 * stops scrolling, which is exactly when the UI no longer needs it. A
 * throttled one updates the whole way down and settles on the final position.
 */
export function useThrottledValue<T>(
    value: T,
    interval: ThrottleInterval,
    options?: UseThrottledValueOptions & { controls?: false }
): T;
export function useThrottledValue<T>(
    value: T,
    interval: ThrottleInterval,
    options: UseThrottledValueControlsOptions
): ThrottledValue<T>;
export function useThrottledValue<T>(
    value: T,
    interval: ThrottleInterval,
    options: UseThrottledValueOptions & { controls?: boolean } = {}
): T | ThrottledValue<T> {
    const { leading = true, controls = false } = options;

    const [throttled, setThrottled] = useState(value);
    const [cancelled, setCancelled] = useState(false);

    const throttledRef = useRef(throttled);
    const cancelledRef = useRef(false);
    const valueRef = useRef(value);
    valueRef.current = value;
    const intervalRef = useRef(interval);
    intervalRef.current = interval;
    const leadingRef = useRef(leading);
    leadingRef.current = leading;
    const closeWindowRef = useRef<(() => void) | null>(null);
    const windowStartRef = useRef(0);

    const commands = useMemo(() => {
        const closeWindow = () => {
            closeWindowRef.current?.();
            closeWindowRef.current = null;
        };

        function endWindow(): void {
            closeWindowRef.current = null;

            if (cancelledRef.current) return;
            if (Object.is(throttledRef.current, valueRef.current)) return;

            publish();
        }

        function armWindow(delay: ThrottleInterval): void {
            closeWindowRef.current = scheduleThrottleWindow(delay, endWindow);
        }

        function openWindow(): void {
            windowStartRef.current = Date.now();
            armWindow(intervalRef.current);
        }

        function publish(): void {
            const next = valueRef.current;
            throttledRef.current = next;
            openWindow();
            setThrottled(next);
        }

        const uncancel = () => {
            if (!cancelledRef.current) return;

            cancelledRef.current = false;
            setCancelled(false);
        };

        return {
            openWindow,
            publish,
            uncancel,
            isWindowOpen: () => closeWindowRef.current !== null,
            dispose: closeWindow,
            rearm: () => {
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
            },
            flush: () => {
                if (Object.is(throttledRef.current, valueRef.current)) return;

                closeWindow();
                uncancel();
                publish();
            },
            cancel: () => {
                if (cancelledRef.current) return;
                if (Object.is(throttledRef.current, valueRef.current)) return;

                closeWindow();
                cancelledRef.current = true;
                setCancelled(true);
            },
        };
    }, []);

    useEffect(() => {
        if (Object.is(throttledRef.current, value)) return;

        commands.uncancel();

        if (commands.isWindowOpen()) return;

        if (leadingRef.current) commands.publish();
        else commands.openWindow();
    }, [value, commands]);

    useEffect(() => {
        commands.rearm();
    }, [interval, commands]);

    useEffect(() => commands.dispose, [commands]);

    const isPending = !cancelled && !Object.is(throttled, value);

    const result = useMemo<ThrottledValue<T>>(
        () => ({ value: throttled, isPending, flush: commands.flush, cancel: commands.cancel }),
        [throttled, isPending, commands]
    );

    return controls ? result : throttled;
}

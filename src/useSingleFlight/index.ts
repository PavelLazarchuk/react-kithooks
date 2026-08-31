import { useCallback, useEffect, useRef, useState } from 'react';

export type SingleFlightMode = 'drop' | 'share';

export interface UseSingleFlightOptions {
    mode?: SingleFlightMode;
}

export interface SingleFlightControls {
    pending: boolean;
    cancel: () => void;
}

/**
 * Runs an async function at most once at a time. While a call is in flight,
 * further calls are dropped — the double-clicked submit button that sends the
 * order twice, the "Retry" pressed three times, the pull-to-refresh fired on
 * top of itself.
 *
 * A concurrency-1 queue is not the same guard: it serializes the second call
 * rather than discarding it, so the form still submits twice, just in order.
 * A debounce isn't either — it limits how often calls start, not whether one
 * is still running.
 *
 * Two modes:
 *
 *   'drop'   (default) a call made while one is running does nothing and
 *            resolves to `undefined` — the safe default for mutations
 *   'share'  it resolves with the running call's result instead, for
 *            idempotent reads where every caller wants the same answer
 *
 * `pending` is state, so a button can bind `disabled` to it directly. It goes
 * back to `false` whether the call resolved or rejected; a rejection is passed
 * on to the caller and releases the lock, and so does a synchronous throw.
 * Nothing is set after unmount, but an in-flight promise still settles for
 * whoever awaited it.
 *
 * `cancel()` drops the lock by hand, for the call that never settles — a
 * request behind a dead connection, a promise the server never answers. It
 * clears `pending` and lets the next call through immediately; the abandoned
 * promise still settles for whoever awaited it, and when it does it no longer
 * touches `pending` or the lock a newer call now holds.
 */
export function useSingleFlight<Args extends unknown[], T>(
    fn: (...args: Args) => Promise<T>,
    options: UseSingleFlightOptions & { mode: 'share' }
): [(...args: Args) => Promise<T>, SingleFlightControls];
export function useSingleFlight<Args extends unknown[], T>(
    fn: (...args: Args) => Promise<T>,
    options?: UseSingleFlightOptions
): [(...args: Args) => Promise<T | undefined>, SingleFlightControls];
export function useSingleFlight<Args extends unknown[], T>(
    fn: (...args: Args) => Promise<T>,
    options: UseSingleFlightOptions = {}
): [(...args: Args) => Promise<T | undefined>, SingleFlightControls] {
    const fnRef = useRef(fn);
    fnRef.current = fn;
    const modeRef = useRef(options.mode);
    modeRef.current = options.mode;

    const runningRef = useRef<{ promise: Promise<T> } | null>(null);
    const mountedRef = useRef(true);
    const [pending, setPending] = useState(false);

    useEffect(() => {
        mountedRef.current = true;

        return () => {
            mountedRef.current = false;
        };
    }, []);

    const run = useCallback((...args: Args): Promise<T | undefined> => {
        const running = runningRef.current;

        if (running)
            return modeRef.current === 'share' ? running.promise : Promise.resolve(undefined);

        let started: Promise<T>;

        try {
            started = Promise.resolve(fnRef.current(...args));
        } catch (error) {
            return Promise.reject(error);
        }

        const entry: { promise: Promise<T> } = { promise: started };

        const release = () => {
            if (runningRef.current !== entry) return;

            runningRef.current = null;

            if (mountedRef.current) setPending(false);
        };

        const tracked = started.then(
            value => {
                release();

                return value;
            },
            error => {
                release();

                throw error;
            }
        );

        entry.promise = tracked;
        runningRef.current = entry;

        if (mountedRef.current) setPending(true);

        return tracked;
    }, []);

    const cancel = useCallback(() => {
        if (!runningRef.current) return;

        runningRef.current = null;

        if (mountedRef.current) setPending(false);
    }, []);

    return [run, { pending, cancel }];
}

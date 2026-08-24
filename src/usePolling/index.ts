import type { DependencyList } from 'react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { errorName } from '../internal/errorName';
import { getOnlineStatusStore } from '../internal/onlineStatusStore';
import { useDepsLengthWarning } from '../internal/useDepsLengthWarning';

export type UsePollingStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UsePollingOptions {
    intervalMs?: number;
    enabled?: boolean;
    immediate?: boolean;
    pauseOnHidden?: boolean;
    pauseWhenOffline?: boolean;
    backoff?: boolean;
    maxBackoffMs?: number;
}

export interface UsePollingReturn<T> {
    data: T | undefined;
    error: unknown;
    status: UsePollingStatus;
    isLoading: boolean;
    isFetching: boolean;
    isPaused: boolean;
    failureCount: number;
    refresh: () => void;
}

interface State<T> {
    status: UsePollingStatus;
    data?: T;
    error?: unknown;
    failureCount: number;
    isFetching: boolean;
}

const noop = () => undefined;
const subscribeNever = () => noop;
const alwaysTrue = () => true;

function subscribeVisibility(onChange: () => void): () => void {
    document.addEventListener('visibilitychange', onChange);
    window.addEventListener('pageshow', onChange);

    return () => {
        document.removeEventListener('visibilitychange', onChange);
        window.removeEventListener('pageshow', onChange);
    };
}

const getIsVisible = () => !document.hidden;

/**
 * Polls an async source on an interval, with the four things
 * `setInterval(() => fetch(...), ms)` gets wrong:
 *
 * - **Overlap.** A tick that takes longer than the interval is never raced by
 *   the next one — the next run is scheduled once the current one settles,
 *   and a superseded response can never overwrite a fresher one.
 * - **Background tabs.** A hidden tab stops polling instead of billing the
 *   server for data nobody is looking at, and refreshes the moment it comes
 *   back rather than after another full interval.
 * - **Offline.** Polling stops while the browser is offline and resumes on
 *   reconnect, instead of generating a failed request every tick.
 * - **A failing endpoint.** Consecutive errors back off exponentially with
 *   jitter, so a struggling server doesn't get a synchronized retry wave from
 *   every open tab.
 */
export function usePolling<T>(
    poller: (signal: AbortSignal) => Promise<T>,
    deps: DependencyList,
    options: UsePollingOptions = {}
): UsePollingReturn<T> {
    const {
        intervalMs = 5_000,
        enabled = true,
        immediate = true,
        pauseOnHidden = true,
        pauseWhenOffline = true,
        backoff = true,
        maxBackoffMs = 30_000,
    } = options;

    useDepsLengthWarning('usePolling', deps);

    const onlineStore = getOnlineStatusStore();
    const isOnline = useSyncExternalStore(
        pauseWhenOffline ? onlineStore.subscribe : subscribeNever,
        pauseWhenOffline ? onlineStore.getSnapshot : alwaysTrue,
        alwaysTrue
    );
    const isVisible = useSyncExternalStore(
        pauseOnHidden ? subscribeVisibility : subscribeNever,
        pauseOnHidden ? getIsVisible : alwaysTrue,
        alwaysTrue
    );

    const active = enabled && isOnline && isVisible;

    const [state, setState] = useState<State<T>>({
        status: 'idle',
        failureCount: 0,
        isFetching: false,
    });

    const pollerRef = useRef(poller);
    pollerRef.current = poller;
    const activeRef = useRef(active);
    activeRef.current = active;
    const configRef = useRef({ intervalMs, immediate, backoff, maxBackoffMs });
    configRef.current = { intervalMs, immediate, backoff, maxBackoffMs };

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const runRef = useRef<(() => void) | null>(null);
    const runIdRef = useRef(0);
    const failuresRef = useRef(0);
    const lastRunAtRef = useRef(0);

    const clearTimer = useCallback(() => {
        if (timerRef.current === null) return;

        clearTimeout(timerRef.current);
        timerRef.current = null;
    }, []);

    const stop = useCallback(() => {
        clearTimer();
        controllerRef.current?.abort();
        controllerRef.current = null;
        runIdRef.current += 1;
    }, [clearTimer]);

    const nextDelay = useCallback(() => {
        const config = configRef.current;
        const failures = failuresRef.current;

        if (!config.backoff || failures === 0) return config.intervalMs;

        const capped = Math.min(config.intervalMs * 2 ** failures, config.maxBackoffMs);
        const jittered = capped / 2 + Math.random() * (capped / 2);

        return Math.max(config.intervalMs, jittered);
    }, []);

    const scheduleNext = useCallback(() => {
        clearTimer();

        if (!activeRef.current) return;

        timerRef.current = setTimeout(() => runRef.current?.(), nextDelay());
    }, [clearTimer, nextDelay]);

    const run = useCallback(() => {
        clearTimer();
        controllerRef.current?.abort();

        const controller = new AbortController();
        controllerRef.current = controller;
        const runId = ++runIdRef.current;
        lastRunAtRef.current = Date.now();

        setState(prev => ({
            ...prev,
            status: prev.status === 'idle' ? 'loading' : prev.status,
            isFetching: true,
        }));

        pollerRef.current(controller.signal).then(
            data => {
                if (runId !== runIdRef.current) return;

                failuresRef.current = 0;
                setState({ status: 'success', data, failureCount: 0, isFetching: false });
                scheduleNext();
            },
            error => {
                if (runId !== runIdRef.current) return;
                if (errorName(error) === 'AbortError') return;

                failuresRef.current += 1;
                setState(prev => ({
                    status: 'error',
                    data: prev.data,
                    error,
                    failureCount: failuresRef.current,
                    isFetching: false,
                }));
                scheduleNext();
            }
        );
    }, [clearTimer, scheduleNext]);

    runRef.current = run;

    const resume = useCallback(() => {
        clearTimer();

        const remaining = nextDelay() - (Date.now() - lastRunAtRef.current);

        if (remaining <= 0) {
            run();
            return;
        }

        timerRef.current = setTimeout(() => runRef.current?.(), remaining);
    }, [clearTimer, nextDelay, run]);

    const refresh = useCallback(() => {
        failuresRef.current = 0;
        run();
    }, [run]);

    useEffect(() => {
        stop();
        failuresRef.current = 0;
        lastRunAtRef.current = configRef.current.immediate ? 0 : Date.now();
        setState({ status: 'idle', failureCount: 0, isFetching: false });
    }, [stop, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (active) {
            resume();
        } else {
            if (state.isFetching) lastRunAtRef.current = 0;

            setState(prev => {
                const status = prev.status === 'loading' ? 'idle' : prev.status;

                if (status === prev.status && !prev.isFetching) return prev;

                return { ...prev, status, isFetching: false };
            });
        }

        return stop;
    }, [active, resume, stop, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        data: state.data,
        error: state.error,
        status: state.status,
        isLoading: state.status === 'loading',
        isFetching: state.isFetching,
        isPaused: enabled && !active,
        failureCount: state.failureCount,
        refresh,
    };
}

import type { DependencyList } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { errorName } from '../internal/errorName';
import { useDepsLengthWarning } from '../internal/useDepsLengthWarning';

export type UseAbortableFetchStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseAbortableFetchOptions {
    enabled?: boolean;
    keepPreviousData?: boolean;
}

export interface UseAbortableFetchReturn<T> {
    data: T | undefined;
    error: unknown;
    status: UseAbortableFetchStatus;
    isLoading: boolean;
    isFetching: boolean;
    refetch: () => Promise<void>;
    cancel: () => void;
}

type SettledStatus = 'idle' | 'success' | 'error';

interface State<T> {
    status: SettledStatus;
    data?: T;
    error?: unknown;
    isFetching: boolean;
}

const IDLE: State<never> = { status: 'idle', isFetching: false };

function stopFetching<T>(prev: State<T>): State<T> {
    return prev.isFetching ? { ...prev, isFetching: false } : prev;
}

/**
 * Runs an abortable fetcher on mount and whenever `deps` changes, aborting
 * the previous in-flight call first. Fixes the two failure modes of
 * `useEffect(() => { fetch(url).then(setData) }, deps)`: a superseded
 * request left running, and — the real bug — its response resolving AFTER a
 * newer one and overwriting fresher state with stale data.
 *
 * The AbortSignal is a courtesy to the fetcher; the request-id check inside
 * is what actually guarantees correctness, since not every async source
 * (or fetch polyfill) honors abort.
 *
 * `isLoading` is the first load, when there is nothing to render yet.
 * `isFetching` is any request in flight — including a `refetch()` or a dep
 * change made while previous data is still on screen, which is the difference
 * between a full-page skeleton and a spinner in the corner.
 */
export function useAbortableFetch<T>(
    fetcher: (signal: AbortSignal) => Promise<T>,
    deps: DependencyList,
    options: UseAbortableFetchOptions = {}
): UseAbortableFetchReturn<T> {
    const { enabled = true, keepPreviousData = true } = options;

    const [state, setState] = useState<State<T>>(IDLE);

    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;
    const keepPreviousDataRef = useRef(keepPreviousData);
    keepPreviousDataRef.current = keepPreviousData;

    const controllerRef = useRef<AbortController | null>(null);
    const requestIdRef = useRef(0);
    const settleRef = useRef<(() => void) | null>(null);

    useDepsLengthWarning('useAbortableFetch', deps);

    const commands = useMemo(() => {
        const settle = () => {
            const resolve = settleRef.current;
            settleRef.current = null;
            resolve?.();
        };

        const abort = () => {
            controllerRef.current?.abort();
            controllerRef.current = null;
            requestIdRef.current += 1;
            settle();
        };

        return {
            abort,
            cancel: () => {
                abort();
                setState(stopFetching);
            },
            run: (): Promise<void> => {
                abort();

                const controller = new AbortController();
                controllerRef.current = controller;
                const requestId = requestIdRef.current;

                setState(prev =>
                    keepPreviousDataRef.current
                        ? { ...prev, isFetching: true }
                        : { status: 'idle', isFetching: true }
                );

                return new Promise<void>(resolve => {
                    settleRef.current = resolve;

                    new Promise<T>(call => call(fetcherRef.current(controller.signal))).then(
                        data => {
                            if (requestId !== requestIdRef.current) return;

                            setState({ status: 'success', data, isFetching: false });
                            settle();
                        },
                        error => {
                            if (requestId !== requestIdRef.current) return;

                            if (errorName(error) === 'AbortError') setState(stopFetching);
                            else {
                                setState(prev => ({
                                    status: 'error',
                                    data: prev.data,
                                    error,
                                    isFetching: false,
                                }));
                            }

                            settle();
                        }
                    );
                });
            },
        };
    }, []);

    useEffect(() => {
        if (!enabled) {
            commands.cancel();

            return;
        }

        void commands.run();

        return commands.abort;
    }, [enabled, commands, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

    const status: UseAbortableFetchStatus =
        state.isFetching && state.status === 'idle' ? 'loading' : state.status;

    return {
        data: state.data,
        error: state.error,
        status,
        isLoading: status === 'loading',
        isFetching: state.isFetching,
        refetch: commands.run,
        cancel: commands.cancel,
    };
}

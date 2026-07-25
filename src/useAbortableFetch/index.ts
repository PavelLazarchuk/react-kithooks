import type { DependencyList } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { errorName } from '../internal/errorName';

export type UseAbortableFetchStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseAbortableFetchOptions {
    enabled?: boolean;
}

export interface UseAbortableFetchReturn<T> {
    data: T | undefined;
    error: unknown;
    status: UseAbortableFetchStatus;
    isLoading: boolean;
    refetch: () => void;
}

interface State<T> {
    status: UseAbortableFetchStatus;
    data?: T;
    error?: unknown;
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
 */
export function useAbortableFetch<T>(
    fetcher: (signal: AbortSignal) => Promise<T>,
    deps: DependencyList,
    options: UseAbortableFetchOptions = {}
): UseAbortableFetchReturn<T> {
    const { enabled = true } = options;

    const [state, setState] = useState<State<T>>({ status: 'idle' });

    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;
    const controllerRef = useRef<AbortController | null>(null);
    const requestIdRef = useRef(0);

    const run = useCallback(() => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        const requestId = ++requestIdRef.current;

        setState(prev => ({ ...prev, status: 'loading' }));

        fetcherRef.current(controller.signal).then(
            data => {
                if (requestId !== requestIdRef.current) return;

                setState({ status: 'success', data });
            },
            error => {
                if (requestId !== requestIdRef.current) return;
                if (errorName(error) === 'AbortError') return;

                setState({ status: 'error', error });
            }
        );
    }, []);

    useEffect(() => {
        if (!enabled) {
            controllerRef.current?.abort();
            setState(prev => (prev.status === 'loading' ? { ...prev, status: 'idle' } : prev));

            return;
        }

        run();

        return () => controllerRef.current?.abort();
    }, [enabled, run, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        data: state.data,
        error: state.error,
        status: state.status,
        isLoading: state.status === 'loading',
        refetch: run,
    };
}

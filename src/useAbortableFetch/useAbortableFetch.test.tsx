import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useAbortableFetch } from './index';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe('useAbortableFetch', () => {
    it('starts idle and never calls the fetcher when disabled', () => {
        const fetcher = vi.fn();
        const { result } = renderHook(() => useAbortableFetch(fetcher, [], { enabled: false }));

        expect(result.current.status).toBe('idle');
        expect(fetcher).not.toHaveBeenCalled();
    });

    it('runs on mount and resolves to success', async () => {
        const fetcher = vi.fn(async () => 'value');
        const { result } = renderHook(() => useAbortableFetch(fetcher, []));

        expect(result.current.isLoading).toBe(true);
        await waitFor(() => expect(result.current.status).toBe('success'));
        expect(result.current.data).toBe('value');
    });

    it('surfaces a rejection as the error status', async () => {
        const fetcher = vi.fn(async () => {
            throw new Error('boom');
        });
        const { result } = renderHook(() => useAbortableFetch(fetcher, []));

        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.error).toBeInstanceOf(Error);
    });

    it('ignores a stale response that resolves after a newer one', async () => {
        const first = deferred<string>();
        const second = deferred<string>();
        const fetcher = vi
            .fn<(signal: AbortSignal) => Promise<string>>()
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);

        const { result, rerender } = renderHook(({ id }) => useAbortableFetch(fetcher, [id]), {
            initialProps: { id: 1 },
        });

        rerender({ id: 2 });
        second.resolve('second');
        await waitFor(() => expect(result.current.status).toBe('success'));

        first.resolve('first');
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current.data).toBe('second');
    });

    it('aborts the in-flight call when deps change', () => {
        const abortSpy = vi.fn();
        const fetcher = vi.fn((signal: AbortSignal) => {
            signal.addEventListener('abort', abortSpy);
            return new Promise<string>(() => undefined);
        });

        const { rerender } = renderHook(({ id }) => useAbortableFetch(fetcher, [id]), {
            initialProps: { id: 1 },
        });
        rerender({ id: 2 });

        expect(abortSpy).toHaveBeenCalledTimes(1);
    });

    it('aborts the in-flight call on unmount', () => {
        const abortSpy = vi.fn();
        const fetcher = vi.fn((signal: AbortSignal) => {
            signal.addEventListener('abort', abortSpy);
            return new Promise<string>(() => undefined);
        });

        const { unmount } = renderHook(() => useAbortableFetch(fetcher, []));
        unmount();

        expect(abortSpy).toHaveBeenCalledTimes(1);
    });

    it('discards a result from a fetcher that ignored its abort signal after being disabled', async () => {
        const inFlight = deferred<string>();
        const fetcher = vi.fn(() => inFlight.promise);

        const { result, rerender } = renderHook(
            ({ enabled }: { enabled: boolean }) => useAbortableFetch(fetcher, [], { enabled }),
            { initialProps: { enabled: true } }
        );
        expect(result.current.isLoading).toBe(true);

        rerender({ enabled: false });
        expect(result.current.status).toBe('idle');

        inFlight.resolve('stale');
        await act(async () => {
            await Promise.resolve();
        });

        expect(result.current.status).toBe('idle');
        expect(result.current.data).toBeUndefined();
    });

    it('ignores an AbortError instead of surfacing it as the error status', async () => {
        const fetcher = vi.fn(
            (signal: AbortSignal) =>
                new Promise<string>((_, reject) => {
                    signal.addEventListener('abort', () =>
                        reject(new DOMException('aborted', 'AbortError'))
                    );
                })
        );

        const { result, rerender } = renderHook(({ id }) => useAbortableFetch(fetcher, [id]), {
            initialProps: { id: 1 },
        });
        rerender({ id: 2 });

        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current.status).not.toBe('error');
    });

    it('refetch aborts the previous call and starts a fresh one', async () => {
        let callCount = 0;
        const fetcher = vi.fn(async () => {
            callCount += 1;
            return `call-${callCount}`;
        });
        const { result } = renderHook(() => useAbortableFetch(fetcher, []));
        await waitFor(() => expect(result.current.status).toBe('success'));

        act(() => result.current.refetch());
        await waitFor(() => expect(result.current.data).toBe('call-2'));
    });

    describe('deps array misuse', () => {
        it('names the hook when the deps array changes length', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            const fetcher = vi.fn(async () => 'ok');

            try {
                const { rerender } = renderHook(
                    ({ deps }: { deps: unknown[] }) => useAbortableFetch(fetcher, deps),
                    { initialProps: { deps: ['a'] as unknown[] } }
                );

                expect(warn).not.toHaveBeenCalled();

                rerender({ deps: ['a', 'b'] });

                expect(warn).toHaveBeenCalledTimes(1);
                expect(String(warn.mock.calls[0]?.[0])).toContain('useAbortableFetch');
            } finally {
                warn.mockRestore();
            }
        });

        it('stays quiet while the length is stable', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            const fetcher = vi.fn(async () => 'ok');

            try {
                const { rerender } = renderHook(
                    ({ id }: { id: number }) => useAbortableFetch(fetcher, [id]),
                    { initialProps: { id: 1 } }
                );

                rerender({ id: 2 });
                rerender({ id: 3 });

                expect(warn).not.toHaveBeenCalled();
            } finally {
                warn.mockRestore();
            }
        });
    });
});

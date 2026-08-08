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

    it('keeps an already loaded result when it is disabled, and refetches when re-enabled', async () => {
        const fetcher = vi
            .fn<(signal: AbortSignal) => Promise<string>>()
            .mockResolvedValueOnce('first')
            .mockResolvedValueOnce('second');

        const { result, rerender } = renderHook(
            ({ enabled }: { enabled: boolean }) => useAbortableFetch(fetcher, [], { enabled }),
            { initialProps: { enabled: true } }
        );
        await waitFor(() => expect(result.current.data).toBe('first'));

        rerender({ enabled: false });

        expect(result.current.status).toBe('success');
        expect(result.current.data).toBe('first');
        expect(result.current.isFetching).toBe(false);

        rerender({ enabled: true });
        await waitFor(() => expect(result.current.data).toBe('second'));
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

        act(() => void result.current.refetch());
        await waitFor(() => expect(result.current.data).toBe('call-2'));
    });

    describe('isLoading vs isFetching', () => {
        function setupRefetch(options?: { keepPreviousData?: boolean }) {
            const pending = deferred<string>();
            const fetcher = vi
                .fn<(signal: AbortSignal) => Promise<string>>()
                .mockResolvedValueOnce('first')
                .mockReturnValueOnce(pending.promise);

            return {
                pending,
                ...renderHook(() => useAbortableFetch(fetcher, [], options)),
            };
        }

        it('separates the first load from a refetch over existing data', async () => {
            const { result, pending } = setupRefetch();

            expect(result.current.status).toBe('loading');
            expect(result.current.isLoading).toBe(true);
            expect(result.current.isFetching).toBe(true);

            await waitFor(() => expect(result.current.status).toBe('success'));
            expect(result.current.isFetching).toBe(false);

            act(() => void result.current.refetch());

            expect(result.current.status).toBe('success');
            expect(result.current.isLoading).toBe(false);
            expect(result.current.isFetching).toBe(true);
            expect(result.current.data).toBe('first');

            await act(async () => {
                pending.resolve('second');
                await pending.promise;
            });
            expect(result.current.data).toBe('second');
            expect(result.current.isFetching).toBe(false);
        });

        it('reports loading again when a refetch has nothing to show', async () => {
            const { result } = setupRefetch({ keepPreviousData: false });

            await waitFor(() => expect(result.current.status).toBe('success'));

            act(() => void result.current.refetch());

            expect(result.current.status).toBe('loading');
            expect(result.current.isLoading).toBe(true);
        });

        it('keeps the error status through a retry', async () => {
            const pending = deferred<string>();
            const fetcher = vi
                .fn<(signal: AbortSignal) => Promise<string>>()
                .mockRejectedValueOnce(new Error('boom'))
                .mockReturnValueOnce(pending.promise);

            const { result } = renderHook(() => useAbortableFetch(fetcher, []));
            await waitFor(() => expect(result.current.status).toBe('error'));

            act(() => void result.current.refetch());

            expect(result.current.status).toBe('error');
            expect(result.current.isFetching).toBe(true);
        });
    });

    describe('refetch()', () => {
        it('resolves once the request settles', async () => {
            const pending = deferred<string>();
            const fetcher = vi
                .fn<(signal: AbortSignal) => Promise<string>>()
                .mockResolvedValueOnce('first')
                .mockReturnValueOnce(pending.promise);

            const { result } = renderHook(() => useAbortableFetch(fetcher, []));
            await waitFor(() => expect(result.current.status).toBe('success'));

            let settled = false;
            let promise!: Promise<void>;
            act(() => {
                promise = result.current.refetch();
            });
            void promise.then(() => {
                settled = true;
            });

            await act(async () => {
                await Promise.resolve();
            });
            expect(settled).toBe(false);

            await act(async () => {
                pending.resolve('second');
                await promise;
            });
            expect(settled).toBe(true);
            expect(result.current.data).toBe('second');
        });

        it('resolves rather than rejects when the request fails', async () => {
            const fetcher = vi
                .fn<(signal: AbortSignal) => Promise<string>>()
                .mockResolvedValueOnce('good')
                .mockRejectedValueOnce(new Error('boom'));

            const { result } = renderHook(() => useAbortableFetch(fetcher, []));
            await waitFor(() => expect(result.current.data).toBe('good'));

            await act(async () => {
                await expect(result.current.refetch()).resolves.toBeUndefined();
            });

            expect(result.current.status).toBe('error');
            expect(result.current.isFetching).toBe(false);
            expect(result.current.data).toBe('good');
        });

        it('settles a superseded promise instead of leaving it dangling', async () => {
            const first = deferred<string>();
            const second = deferred<string>();
            const fetcher = vi
                .fn<(signal: AbortSignal) => Promise<string>>()
                .mockResolvedValueOnce('mount')
                .mockReturnValueOnce(first.promise)
                .mockReturnValueOnce(second.promise);

            const { result } = renderHook(() => useAbortableFetch(fetcher, []));
            await waitFor(() => expect(result.current.status).toBe('success'));

            let superseded!: Promise<void>;
            act(() => {
                superseded = result.current.refetch();
            });
            let settled = false;
            void superseded.then(() => {
                settled = true;
            });

            act(() => void result.current.refetch());
            await act(async () => {
                await superseded;
            });

            expect(settled).toBe(true);
        });
    });

    describe('cancel()', () => {
        it('aborts the in-flight first load and returns to idle', () => {
            const abortSpy = vi.fn();
            const fetcher = vi.fn((signal: AbortSignal) => {
                signal.addEventListener('abort', abortSpy);
                return new Promise<string>(() => undefined);
            });

            const { result } = renderHook(() => useAbortableFetch(fetcher, []));
            expect(result.current.isFetching).toBe(true);

            act(() => result.current.cancel());

            expect(abortSpy).toHaveBeenCalledTimes(1);
            expect(result.current.status).toBe('idle');
            expect(result.current.isFetching).toBe(false);
        });

        it('keeps data already on screen when it cancels a refetch', async () => {
            const fetcher = vi
                .fn<(signal: AbortSignal) => Promise<string>>()
                .mockResolvedValueOnce('first')
                .mockReturnValueOnce(new Promise<string>(() => undefined));

            const { result } = renderHook(() => useAbortableFetch(fetcher, []));
            await waitFor(() => expect(result.current.status).toBe('success'));

            act(() => void result.current.refetch());
            act(() => result.current.cancel());

            expect(result.current.status).toBe('success');
            expect(result.current.data).toBe('first');
            expect(result.current.isFetching).toBe(false);
        });

        it('discards a response that arrives after it', async () => {
            const inFlight = deferred<string>();
            const fetcher = vi.fn(() => inFlight.promise);

            const { result } = renderHook(() => useAbortableFetch(fetcher, []));
            act(() => result.current.cancel());

            inFlight.resolve('stale');
            await act(async () => {
                await Promise.resolve();
            });

            expect(result.current.data).toBeUndefined();
            expect(result.current.status).toBe('idle');
        });
    });

    describe('keepPreviousData', () => {
        it('keeps the previous result while a new dep loads (default)', async () => {
            const pending = deferred<string>();
            const fetcher = vi
                .fn<(signal: AbortSignal) => Promise<string>>()
                .mockResolvedValueOnce('user-1')
                .mockReturnValueOnce(pending.promise);

            const { result, rerender } = renderHook(({ id }) => useAbortableFetch(fetcher, [id]), {
                initialProps: { id: 1 },
            });
            await waitFor(() => expect(result.current.data).toBe('user-1'));

            rerender({ id: 2 });

            expect(result.current.data).toBe('user-1');
            expect(result.current.status).toBe('success');
            expect(result.current.isLoading).toBe(false);
            expect(result.current.isFetching).toBe(true);
        });

        it('false clears data and reports a hard loading state', async () => {
            const pending = deferred<string>();
            const fetcher = vi
                .fn<(signal: AbortSignal) => Promise<string>>()
                .mockResolvedValueOnce('user-1')
                .mockReturnValueOnce(pending.promise);

            const { result, rerender } = renderHook(
                ({ id }) => useAbortableFetch(fetcher, [id], { keepPreviousData: false }),
                { initialProps: { id: 1 } }
            );
            await waitFor(() => expect(result.current.data).toBe('user-1'));

            rerender({ id: 2 });

            expect(result.current.data).toBeUndefined();
            expect(result.current.status).toBe('loading');
            expect(result.current.isLoading).toBe(true);
        });

        it('false also clears the previous error', async () => {
            const pending = deferred<string>();
            const fetcher = vi
                .fn<(signal: AbortSignal) => Promise<string>>()
                .mockRejectedValueOnce(new Error('boom'))
                .mockReturnValueOnce(pending.promise);

            const { result } = renderHook(() =>
                useAbortableFetch(fetcher, [], { keepPreviousData: false })
            );
            await waitFor(() => expect(result.current.status).toBe('error'));

            act(() => void result.current.refetch());

            expect(result.current.error).toBeUndefined();
            expect(result.current.status).toBe('loading');
        });
    });

    it('treats a synchronous throw as an error rather than rejecting refetch()', async () => {
        const fetcher = vi.fn((): Promise<string> => {
            throw new Error('boom');
        });
        const { result } = renderHook(() => useAbortableFetch(fetcher, []));

        await waitFor(() => expect(result.current.status).toBe('error'));
        expect((result.current.error as Error).message).toBe('boom');
        expect(result.current.isFetching).toBe(false);

        await act(async () => {
            await expect(result.current.refetch()).resolves.toBeUndefined();
        });
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

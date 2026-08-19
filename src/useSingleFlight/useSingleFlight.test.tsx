import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useSingleFlight } from './index';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
}

const flush = () => act(async () => undefined);

describe('useSingleFlight', () => {
    it('drops calls made while one is in flight', async () => {
        const gate = deferred<string>();
        const fn = vi.fn(() => gate.promise);
        const { result } = renderHook(() => useSingleFlight(fn));

        let first!: Promise<string | undefined>;
        let second!: Promise<string | undefined>;

        act(() => {
            first = result.current[0]();
            second = result.current[0]();
        });

        expect(fn).toHaveBeenCalledTimes(1);
        await expect(second).resolves.toBeUndefined();

        await act(async () => gate.resolve('done'));

        await expect(first).resolves.toBe('done');
    });

    it('runs again once the previous call has settled', async () => {
        const fn = vi.fn(() => Promise.resolve('ok'));
        const { result } = renderHook(() => useSingleFlight(fn));

        await act(async () => {
            await result.current[0]();
        });
        await act(async () => {
            await result.current[0]();
        });

        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('exposes pending as state for the duration of the call', async () => {
        const gate = deferred<void>();
        const { result } = renderHook(() => useSingleFlight(() => gate.promise));

        expect(result.current[1].pending).toBe(false);

        act(() => {
            void result.current[0]();
        });
        expect(result.current[1].pending).toBe(true);

        await act(async () => gate.resolve());
        expect(result.current[1].pending).toBe(false);
    });

    it('releases the lock and clears pending when the call rejects', async () => {
        const gate = deferred<void>();
        const fn = vi.fn(() => gate.promise);
        const { result } = renderHook(() => useSingleFlight(fn));

        let call!: Promise<void | undefined>;

        act(() => {
            call = result.current[0]();
        });

        await act(async () => {
            gate.reject(new Error('boom'));
            await expect(call).rejects.toThrow('boom');
        });

        expect(result.current[1].pending).toBe(false);

        await act(async () => {
            await result.current[0]().catch(() => undefined);
        });
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('rejects and stays unlocked when fn throws synchronously', async () => {
        const fn = vi.fn(() => {
            throw new Error('sync');
        }) as unknown as () => Promise<void>;
        const { result } = renderHook(() => useSingleFlight(fn));

        await act(async () => {
            await expect(result.current[0]()).rejects.toThrow('sync');
        });

        expect(result.current[1].pending).toBe(false);

        await act(async () => {
            await expect(result.current[0]()).rejects.toThrow('sync');
        });
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('shares the in-flight result in share mode', async () => {
        const gate = deferred<string>();
        const fn = vi.fn(() => gate.promise);
        const { result } = renderHook(() => useSingleFlight(fn, { mode: 'share' }));

        let first!: Promise<string>;
        let second!: Promise<string>;

        act(() => {
            first = result.current[0]();
            second = result.current[0]();
        });

        expect(fn).toHaveBeenCalledTimes(1);

        await act(async () => gate.resolve('shared'));

        await expect(first).resolves.toBe('shared');
        await expect(second).resolves.toBe('shared');
    });

    it('delivers a rejection to every sharing caller', async () => {
        const gate = deferred<string>();
        const { result } = renderHook(() => useSingleFlight(() => gate.promise, { mode: 'share' }));

        let first!: Promise<string>;
        let second!: Promise<string>;

        act(() => {
            first = result.current[0]();
            second = result.current[0]();
        });

        await act(async () => {
            gate.reject(new Error('boom'));
            await Promise.all([
                expect(first).rejects.toThrow('boom'),
                expect(second).rejects.toThrow('boom'),
            ]);
        });

        expect(result.current[1].pending).toBe(false);
    });

    it('ignores the args of a shared call', async () => {
        const gate = deferred<string>();
        const seen: string[] = [];
        const fn = vi.fn((value: string) => {
            seen.push(value);

            return gate.promise;
        });
        const { result } = renderHook(() => useSingleFlight(fn, { mode: 'share' }));

        act(() => {
            void result.current[0]('first');
            void result.current[0]('second');
        });

        expect(seen).toEqual(['first']);

        await act(async () => gate.resolve('done'));
    });

    it('calls the latest fn, without a stale closure', async () => {
        const first = vi.fn(() => Promise.resolve('a'));
        const second = vi.fn(() => Promise.resolve('b'));
        const { result, rerender } = renderHook(({ fn }) => useSingleFlight(fn), {
            initialProps: { fn: first },
        });

        rerender({ fn: second });

        await act(async () => {
            await expect(result.current[0]()).resolves.toBe('b');
        });

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('keeps one identity across renders', () => {
        const { result, rerender } = renderHook(() => useSingleFlight(() => Promise.resolve()));
        const run = result.current[0];

        rerender();
        act(() => {
            void result.current[0]();
        });

        expect(result.current[0]).toBe(run);
    });

    it('settles for the caller after unmount without setting state', async () => {
        const gate = deferred<string>();
        const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { result, unmount } = renderHook(() => useSingleFlight(() => gate.promise));

        let call!: Promise<string | undefined>;

        act(() => {
            call = result.current[0]();
        });

        unmount();
        gate.resolve('late');

        await expect(call).resolves.toBe('late');
        await flush();

        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();
    });
});

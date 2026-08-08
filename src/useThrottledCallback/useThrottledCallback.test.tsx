import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useThrottledCallback } from './index';

describe('useThrottledCallback', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('fires immediately on the first call', () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useThrottledCallback(fn, 100));

        act(() => result.current('a'));

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('a');
    });

    it('collapses calls made inside the window into one trailing call', () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useThrottledCallback(fn, 100));

        act(() => {
            result.current('a');
            result.current('b');
            result.current('c');
        });
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenLastCalledWith('a');

        act(() => vi.advanceTimersByTime(100));
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenLastCalledWith('c');
    });

    it('always delivers the last call of a burst', () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useThrottledCallback(fn, 100));

        act(() => result.current('first'));
        act(() => vi.advanceTimersByTime(90));
        act(() => result.current('last'));

        act(() => vi.advanceTimersByTime(10));
        expect(fn).toHaveBeenLastCalledWith('last');
    });

    it('fires immediately again once the window has passed', () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useThrottledCallback(fn, 100));

        act(() => result.current('a'));
        act(() => vi.advanceTimersByTime(150));
        act(() => result.current('b'));

        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenLastCalledWith('b');
    });

    it('rate-limits a continuous stream to one call per window', () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useThrottledCallback(fn, 100));

        for (let i = 0; i < 10; i += 1) {
            act(() => result.current(`call${i}`));
            act(() => vi.advanceTimersByTime(20));
        }

        expect(fn).toHaveBeenCalledTimes(3);
        expect(fn.mock.calls).toEqual([['call0'], ['call4'], ['call9']]);
    });

    it('keeps a stable identity across renders', () => {
        const { result, rerender } = renderHook(({ fn }) => useThrottledCallback(fn, 100), {
            initialProps: { fn: vi.fn() },
        });
        const first = result.current;

        rerender({ fn: vi.fn() });
        expect(result.current).toBe(first);
    });

    it('invokes the LATEST fn on the trailing edge', () => {
        const stale = vi.fn();
        const fresh = vi.fn();
        const { result, rerender } = renderHook(({ fn }) => useThrottledCallback(fn, 100), {
            initialProps: { fn: stale },
        });

        act(() => result.current('lead'));
        expect(stale).toHaveBeenCalledWith('lead');

        act(() => result.current('trail'));
        rerender({ fn: fresh });
        act(() => vi.advanceTimersByTime(100));

        expect(stale).toHaveBeenCalledTimes(1);
        expect(fresh).toHaveBeenCalledWith('trail');
    });

    it('cancels the pending trailing call on unmount', () => {
        const fn = vi.fn();
        const { result, unmount } = renderHook(() => useThrottledCallback(fn, 100));

        act(() => result.current('a'));
        act(() => result.current('b'));
        unmount();
        act(() => vi.advanceTimersByTime(1000));

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('a');
    });

    it('picks up a changed interval from the next window', () => {
        const fn = vi.fn();
        const { result, rerender } = renderHook(
            ({ interval }) => useThrottledCallback(fn, interval),
            { initialProps: { interval: 100 } }
        );

        act(() => result.current('a'));
        act(() => vi.advanceTimersByTime(100));

        rerender({ interval: 500 });
        act(() => result.current('b'));
        act(() => result.current('c'));
        act(() => vi.advanceTimersByTime(100));
        expect(fn).toHaveBeenCalledTimes(2);

        act(() => vi.advanceTimersByTime(400));
        expect(fn).toHaveBeenLastCalledWith('c');
    });

    describe('edges', () => {
        it('leading: false defers the first call to the end of the window', () => {
            const fn = vi.fn();
            const { result } = renderHook(() => useThrottledCallback(fn, 100, { leading: false }));

            act(() => result.current('a'));
            expect(fn).not.toHaveBeenCalled();

            act(() => vi.advanceTimersByTime(100));
            expect(fn).toHaveBeenCalledWith('a');
        });

        it('leading: false still rate-limits to one call per window', () => {
            const fn = vi.fn();
            const { result } = renderHook(() => useThrottledCallback(fn, 100, { leading: false }));

            for (let i = 0; i < 10; i += 1) {
                act(() => result.current(`call${i}`));
                act(() => vi.advanceTimersByTime(20));
            }

            expect(fn.mock.calls).toEqual([['call4'], ['call9']]);
        });

        it('trailing: false drops calls made inside the window', () => {
            const fn = vi.fn();
            const { result } = renderHook(() => useThrottledCallback(fn, 100, { trailing: false }));

            act(() => result.current('a'));
            act(() => result.current('b'));
            act(() => vi.advanceTimersByTime(100));

            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith('a');
            expect(result.current.isPending()).toBe(false);
        });

        it('warns in development when both edges are off', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            const fn = vi.fn();
            const { rerender } = renderHook(() =>
                useThrottledCallback(fn, 100, { leading: false, trailing: false })
            );

            rerender();

            expect(warn).toHaveBeenCalledTimes(1);
            expect(String(warn.mock.calls[0]?.[0])).toContain('can never fire');
        });
    });

    describe('flush / cancel / isPending', () => {
        it('flush() invokes the pending call immediately', () => {
            const fn = vi.fn();
            const { result } = renderHook(() => useThrottledCallback(fn, 100));

            act(() => result.current('a'));
            act(() => result.current('b'));
            act(() => result.current.flush());

            expect(fn).toHaveBeenCalledTimes(2);
            expect(fn).toHaveBeenLastCalledWith('b');
            expect(result.current.isPending()).toBe(false);

            act(() => vi.advanceTimersByTime(1000));
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('flush() restarts the window rather than opening a hole in it', () => {
            const fn = vi.fn();
            const { result } = renderHook(() => useThrottledCallback(fn, 100));

            act(() => result.current('a'));
            act(() => vi.advanceTimersByTime(50));
            act(() => result.current('b'));
            act(() => result.current.flush());
            expect(fn).toHaveBeenCalledTimes(2);

            act(() => result.current('c'));
            act(() => vi.advanceTimersByTime(99));
            expect(fn).toHaveBeenCalledTimes(2);

            act(() => vi.advanceTimersByTime(1));
            expect(fn).toHaveBeenLastCalledWith('c');
        });

        it('flush() is a no-op when nothing is pending', () => {
            const fn = vi.fn();
            const { result } = renderHook(() => useThrottledCallback(fn, 100));

            act(() => result.current.flush());
            expect(fn).not.toHaveBeenCalled();
        });

        it('cancel() drops the pending call and reopens the leading edge', () => {
            const fn = vi.fn();
            const { result } = renderHook(() => useThrottledCallback(fn, 100));

            act(() => result.current('a'));
            act(() => result.current('dropped'));
            act(() => result.current.cancel());
            act(() => vi.advanceTimersByTime(1000));
            expect(fn).toHaveBeenCalledTimes(1);

            act(() => result.current('b'));
            expect(fn).toHaveBeenLastCalledWith('b');
        });

        it('isPending() tracks the undelivered call', () => {
            const fn = vi.fn();
            const { result } = renderHook(() => useThrottledCallback(fn, 100));

            expect(result.current.isPending()).toBe(false);

            act(() => result.current('a'));
            expect(result.current.isPending()).toBe(false);

            act(() => result.current('b'));
            expect(result.current.isPending()).toBe(true);

            act(() => vi.advanceTimersByTime(100));
            expect(result.current.isPending()).toBe(false);
        });
    });

    describe("interval: 'frame'", () => {
        it('coalesces every call in a frame into one', () => {
            const fn = vi.fn();
            const { result } = renderHook(() => useThrottledCallback(fn, 'frame'));

            act(() => {
                for (let i = 0; i < 20; i += 1) result.current(i);
            });
            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith(0);

            act(() => vi.advanceTimersToNextFrame());
            expect(fn).toHaveBeenCalledTimes(2);
            expect(fn).toHaveBeenLastCalledWith(19);
        });

        it('fires once per frame across several frames', () => {
            const fn = vi.fn();
            const { result } = renderHook(() => useThrottledCallback(fn, 'frame'));

            for (let frame = 0; frame < 4; frame += 1) {
                act(() => {
                    result.current(`f${frame}a`);
                    result.current(`f${frame}b`);
                });
                act(() => vi.advanceTimersToNextFrame());
            }

            expect(fn.mock.calls).toEqual([['f0a'], ['f0b'], ['f1b'], ['f2b'], ['f3b']]);
        });
    });
});

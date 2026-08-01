import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useDebouncedCallback } from './index';

describe('useDebouncedCallback', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('fires once after the delay, with the args of the last call', () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useDebouncedCallback(fn, 300));

        act(() => {
            result.current('a');
            result.current('b');
            result.current('c');
        });
        expect(fn).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(300));
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('c');
    });

    it('restarts the window on each call', () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useDebouncedCallback(fn, 300));

        act(() => result.current('a'));
        act(() => vi.advanceTimersByTime(200));
        act(() => result.current('b'));
        act(() => vi.advanceTimersByTime(200));
        expect(fn).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(100));
        expect(fn).toHaveBeenCalledWith('b');
    });

    it('keeps a stable identity across renders', () => {
        const { result, rerender } = renderHook(({ fn }) => useDebouncedCallback(fn, 300), {
            initialProps: { fn: vi.fn() },
        });
        const first = result.current;

        rerender({ fn: vi.fn() });
        expect(result.current).toBe(first);
    });

    it('invokes the LATEST fn, not the one captured when the call was scheduled', () => {
        const stale = vi.fn();
        const fresh = vi.fn();
        const { result, rerender } = renderHook(({ fn }) => useDebouncedCallback(fn, 300), {
            initialProps: { fn: stale },
        });

        act(() => result.current('x'));
        rerender({ fn: fresh });

        act(() => vi.advanceTimersByTime(300));
        expect(stale).not.toHaveBeenCalled();
        expect(fresh).toHaveBeenCalledWith('x');
    });

    it('cancel() drops the pending invocation', () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useDebouncedCallback(fn, 300));

        act(() => result.current('x'));
        act(() => result.current.cancel());
        act(() => vi.advanceTimersByTime(1000));

        expect(fn).not.toHaveBeenCalled();
    });

    it('flush() invokes immediately and clears the pending state', () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useDebouncedCallback(fn, 300));

        act(() => result.current('x'));
        act(() => result.current.flush());

        expect(fn).toHaveBeenCalledWith('x');
        expect(result.current.isPending()).toBe(false);

        act(() => vi.advanceTimersByTime(1000));
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('flush() is a no-op when nothing is pending', () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useDebouncedCallback(fn, 300));

        act(() => result.current.flush());
        expect(fn).not.toHaveBeenCalled();
    });

    it('isPending() tracks the window', () => {
        const fn = vi.fn();
        const { result } = renderHook(() => useDebouncedCallback(fn, 300));

        expect(result.current.isPending()).toBe(false);
        act(() => result.current('x'));
        expect(result.current.isPending()).toBe(true);
        act(() => vi.advanceTimersByTime(300));
        expect(result.current.isPending()).toBe(false);
    });

    it('cancels the pending invocation on unmount', () => {
        const fn = vi.fn();
        const { result, unmount } = renderHook(() => useDebouncedCallback(fn, 300));

        act(() => result.current('x'));
        unmount();
        act(() => vi.advanceTimersByTime(1000));

        expect(fn).not.toHaveBeenCalled();
    });

    it('picks up a changed delay for calls made after the change', () => {
        const fn = vi.fn();
        const { result, rerender } = renderHook(({ delay }) => useDebouncedCallback(fn, delay), {
            initialProps: { delay: 300 },
        });

        rerender({ delay: 50 });
        act(() => result.current('x'));
        act(() => vi.advanceTimersByTime(50));

        expect(fn).toHaveBeenCalledWith('x');
    });

    describe('maxWaitMs', () => {
        function callContinuously(call: (arg: string) => void, steps: number): void {
            for (let i = 0; i < steps; i += 1) {
                act(() => call(`call${i}`));
                act(() => vi.advanceTimersByTime(200));
            }
        }

        it('starves forever without it', () => {
            const fn = vi.fn();
            const { result } = renderHook(() => useDebouncedCallback(fn, 300));

            callContinuously(result.current, 6);

            expect(fn).not.toHaveBeenCalled();
        });

        it('invokes on the deadline during a continuous call stream', () => {
            const fn = vi.fn();
            const { result } = renderHook(() => useDebouncedCallback(fn, 300, { maxWaitMs: 1000 }));

            callContinuously(result.current, 6);

            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith('call4');
        });

        it('still debounces normally when calls settle before the deadline', () => {
            const fn = vi.fn();
            const { result } = renderHook(() => useDebouncedCallback(fn, 300, { maxWaitMs: 1000 }));

            act(() => result.current('x'));
            act(() => vi.advanceTimersByTime(299));
            expect(fn).not.toHaveBeenCalled();

            act(() => vi.advanceTimersByTime(1));
            expect(fn).toHaveBeenCalledWith('x');
        });

        it('does not let a cancelled run shorten the next one', () => {
            const fn = vi.fn();
            const { result } = renderHook(() => useDebouncedCallback(fn, 300, { maxWaitMs: 1000 }));

            act(() => result.current('dropped'));
            act(() => vi.advanceTimersByTime(200));
            act(() => result.current.cancel());
            act(() => vi.advanceTimersByTime(2000));

            act(() => result.current('kept'));
            act(() => vi.advanceTimersByTime(299));
            expect(fn).not.toHaveBeenCalled();

            act(() => vi.advanceTimersByTime(1));
            expect(fn).toHaveBeenCalledWith('kept');
        });

        it('does not let a flushed run shorten the next one', () => {
            const fn = vi.fn();
            const { result } = renderHook(() => useDebouncedCallback(fn, 300, { maxWaitMs: 1000 }));

            act(() => result.current('first'));
            act(() => vi.advanceTimersByTime(200));
            act(() => result.current.flush());
            expect(fn).toHaveBeenCalledWith('first');

            act(() => result.current('second'));
            act(() => vi.advanceTimersByTime(299));
            expect(fn).toHaveBeenCalledTimes(1);

            act(() => vi.advanceTimersByTime(1));
            expect(fn).toHaveBeenCalledWith('second');
        });
    });
});

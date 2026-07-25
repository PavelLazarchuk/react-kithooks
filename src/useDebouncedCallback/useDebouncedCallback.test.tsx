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
});

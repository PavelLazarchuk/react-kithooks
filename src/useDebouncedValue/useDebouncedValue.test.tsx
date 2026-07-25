import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useDebouncedValue } from './index';

describe('useDebouncedValue', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns the initial value immediately', () => {
        const { result } = renderHook(() => useDebouncedValue('a', 300));
        expect(result.current).toBe('a');
    });

    it('updates only after the delay has elapsed', () => {
        const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
            initialProps: { value: 'a' },
        });

        rerender({ value: 'b' });
        expect(result.current).toBe('a');

        act(() => vi.advanceTimersByTime(299));
        expect(result.current).toBe('a');

        act(() => vi.advanceTimersByTime(1));
        expect(result.current).toBe('b');
    });

    it('collapses rapid changes into a single update with the final value', () => {
        const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
            initialProps: { value: 'a' },
        });

        rerender({ value: 'ab' });
        act(() => vi.advanceTimersByTime(100));
        rerender({ value: 'abc' });
        act(() => vi.advanceTimersByTime(100));
        rerender({ value: 'abcd' });

        act(() => vi.advanceTimersByTime(300));
        expect(result.current).toBe('abcd');
    });

    it('produces no update when the value reverts within the window', () => {
        const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
            initialProps: { value: 'a' },
        });

        rerender({ value: 'b' });
        act(() => vi.advanceTimersByTime(100));
        rerender({ value: 'a' });

        act(() => vi.advanceTimersByTime(1000));
        expect(result.current).toBe('a');
    });

    it('does not throw or update after unmount', () => {
        const { rerender, unmount } = renderHook(({ value }) => useDebouncedValue(value, 300), {
            initialProps: { value: 'a' },
        });

        rerender({ value: 'b' });
        unmount();
        expect(() => act(() => vi.advanceTimersByTime(1000))).not.toThrow();
    });

    it('applies a changed delay to the pending update', () => {
        const { result, rerender } = renderHook(
            ({ value, delay }) => useDebouncedValue(value, delay),
            { initialProps: { value: 'a', delay: 300 } }
        );

        rerender({ value: 'b', delay: 300 });
        rerender({ value: 'b', delay: 50 });

        act(() => vi.advanceTimersByTime(50));
        expect(result.current).toBe('b');
    });
});

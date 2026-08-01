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

    describe('maxWaitMs', () => {
        function typeContinuously(
            rerender: (props: { value: string }) => void,
            steps: number
        ): void {
            for (let i = 1; i <= steps; i += 1) {
                rerender({ value: `a${i}` });
                act(() => vi.advanceTimersByTime(200));
            }
        }

        it('starves forever without it', () => {
            const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
                initialProps: { value: 'a' },
            });

            typeContinuously(rerender, 6);

            expect(result.current).toBe('a');
        });

        it('commits on the deadline even while the value keeps changing', () => {
            const { result, rerender } = renderHook(
                ({ value }) => useDebouncedValue(value, 300, { maxWaitMs: 1000 }),
                { initialProps: { value: 'a' } }
            );

            typeContinuously(rerender, 6);

            expect(result.current).toBe('a5');
        });

        it('still debounces normally when the value settles before the deadline', () => {
            const { result, rerender } = renderHook(
                ({ value }) => useDebouncedValue(value, 300, { maxWaitMs: 1000 }),
                { initialProps: { value: 'a' } }
            );

            rerender({ value: 'b' });
            act(() => vi.advanceTimersByTime(299));
            expect(result.current).toBe('a');

            act(() => vi.advanceTimersByTime(1));
            expect(result.current).toBe('b');
        });

        it('does not let a finished run shorten the next one', () => {
            const { result, rerender } = renderHook(
                ({ value }) => useDebouncedValue(value, 300, { maxWaitMs: 1000 }),
                { initialProps: { value: 'a' } }
            );

            rerender({ value: 'b' });
            act(() => vi.advanceTimersByTime(100));
            rerender({ value: 'a' });
            act(() => vi.advanceTimersByTime(2000));

            rerender({ value: 'c' });
            act(() => vi.advanceTimersByTime(299));
            expect(result.current).toBe('a');

            act(() => vi.advanceTimersByTime(1));
            expect(result.current).toBe('c');
        });
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useThrottledValue } from './index';

describe('useThrottledValue', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    function setup(initial = 'a', interval: number | 'frame' = 100) {
        return renderHook(({ value }) => useThrottledValue(value, interval), {
            initialProps: { value: initial },
        });
    }

    it('returns the value itself on the first render', () => {
        const { result } = setup();

        expect(result.current).toBe('a');
    });

    it('publishes the first change immediately', () => {
        const { result, rerender } = setup();

        rerender({ value: 'b' });
        expect(result.current).toBe('b');
    });

    it('collapses changes inside the window into one update', () => {
        const { result, rerender } = setup();

        rerender({ value: 'b' });
        rerender({ value: 'c' });
        rerender({ value: 'd' });
        expect(result.current).toBe('b');

        act(() => vi.advanceTimersByTime(100));
        expect(result.current).toBe('d');
    });

    it('always converges on the last value of a burst', () => {
        const { result, rerender } = setup();

        rerender({ value: 'b' });
        act(() => vi.advanceTimersByTime(90));
        rerender({ value: 'final' });

        act(() => vi.advanceTimersByTime(10));
        expect(result.current).toBe('final');
    });

    it('rate-limits a stream to one update per window', () => {
        const { result, rerender } = renderHook(({ value }) => useThrottledValue(value, 100), {
            initialProps: { value: 0 },
        });

        rerender({ value: 1 });
        expect(result.current).toBe(1);

        for (let i = 2; i <= 6; i += 1) {
            rerender({ value: i });
            act(() => vi.advanceTimersByTime(20));
        }

        expect(result.current).toBe(6);

        for (let i = 7; i <= 9; i += 1) {
            rerender({ value: i });
            act(() => vi.advanceTimersByTime(20));
        }
        expect(result.current).toBe(6);

        act(() => vi.advanceTimersByTime(40));
        expect(result.current).toBe(9);
    });

    it('publishes immediately again once the window has passed', () => {
        const { result, rerender } = setup();

        rerender({ value: 'b' });
        act(() => vi.advanceTimersByTime(150));
        rerender({ value: 'c' });

        expect(result.current).toBe('c');
    });

    it('produces no update when the value reverts inside the window', () => {
        const { result, rerender } = setup();

        rerender({ value: 'b' });
        rerender({ value: 'c' });
        rerender({ value: 'b' });

        act(() => vi.advanceTimersByTime(100));
        expect(result.current).toBe('b');

        rerender({ value: 'd' });
        expect(result.current).toBe('d');
    });

    it('leading: false defers the first change to the end of the window', () => {
        const { result, rerender } = renderHook(
            ({ value }) => useThrottledValue(value, 100, { leading: false }),
            { initialProps: { value: 'a' } }
        );

        rerender({ value: 'b' });
        expect(result.current).toBe('a');

        act(() => vi.advanceTimersByTime(100));
        expect(result.current).toBe('b');
    });

    it('does not update after unmount', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { result, rerender, unmount } = setup();

        rerender({ value: 'b' });
        rerender({ value: 'c' });
        unmount();
        act(() => vi.advanceTimersByTime(1000));

        expect(result.current).toBe('b');
        expect(error).not.toHaveBeenCalled();
    });

    describe('controls', () => {
        function setupControls(interval: number | 'frame' = 100) {
            return renderHook(
                ({ value }) => useThrottledValue(value, interval, { controls: true }),
                {
                    initialProps: { value: 'a' },
                }
            );
        }

        it('reports isPending while an update is held back', () => {
            const { result, rerender } = setupControls();

            expect(result.current.isPending).toBe(false);

            rerender({ value: 'b' });
            expect(result.current.value).toBe('b');
            expect(result.current.isPending).toBe(false);

            rerender({ value: 'c' });
            expect(result.current.value).toBe('b');
            expect(result.current.isPending).toBe(true);

            act(() => vi.advanceTimersByTime(100));
            expect(result.current.value).toBe('c');
            expect(result.current.isPending).toBe(false);
        });

        it('flush() publishes the held value now', () => {
            const { result, rerender } = setupControls();

            rerender({ value: 'b' });
            rerender({ value: 'c' });
            act(() => result.current.flush());

            expect(result.current.value).toBe('c');
            expect(result.current.isPending).toBe(false);
        });

        it('flush() is a no-op when nothing is held', () => {
            const { result, rerender } = setupControls();

            rerender({ value: 'b' });
            act(() => result.current.flush());
            expect(result.current.value).toBe('b');

            rerender({ value: 'c' });
            expect(result.current.value).toBe('b');
        });

        it('cancel() keeps the current value until the next change', () => {
            const { result, rerender } = setupControls();

            rerender({ value: 'b' });
            rerender({ value: 'c' });
            act(() => result.current.cancel());

            expect(result.current.value).toBe('b');
            expect(result.current.isPending).toBe(false);

            act(() => vi.advanceTimersByTime(1000));
            expect(result.current.value).toBe('b');

            rerender({ value: 'd' });
            expect(result.current.value).toBe('d');
            expect(result.current.isPending).toBe(false);
        });

        it('cancel() with nothing held leaves the open window intact', () => {
            const { result, rerender } = setupControls();

            rerender({ value: 'b' });
            expect(result.current.value).toBe('b');

            act(() => result.current.cancel());

            rerender({ value: 'c' });
            expect(result.current.value).toBe('b');
            expect(result.current.isPending).toBe(true);

            act(() => vi.advanceTimersByTime(100));
            expect(result.current.value).toBe('c');
        });
    });

    describe("interval: 'frame'", () => {
        it('publishes at most once per animation frame', () => {
            const { result, rerender } = setup('a', 'frame');

            rerender({ value: 'b' });
            expect(result.current).toBe('b');

            rerender({ value: 'c' });
            rerender({ value: 'd' });
            expect(result.current).toBe('b');

            act(() => vi.advanceTimersToNextFrame());
            expect(result.current).toBe('d');
        });
    });
});

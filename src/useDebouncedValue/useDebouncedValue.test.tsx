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

    describe('controls', () => {
        const renderControlled = (initial: string, delay = 300) =>
            renderHook(({ value }) => useDebouncedValue(value, delay, { controls: true }), {
                initialProps: { value: initial },
            });

        it('returns the value alongside the controls', () => {
            const { result } = renderControlled('a');

            expect(result.current.value).toBe('a');
            expect(result.current.isPending).toBe(false);
        });

        it('reports isPending for exactly as long as an update is scheduled', () => {
            const { result, rerender } = renderControlled('a');

            rerender({ value: 'b' });
            expect(result.current.isPending).toBe(true);

            act(() => vi.advanceTimersByTime(300));
            expect(result.current.isPending).toBe(false);
            expect(result.current.value).toBe('b');
        });

        it('is not pending when the value reverts within the window', () => {
            const { result, rerender } = renderControlled('a');

            rerender({ value: 'b' });
            act(() => vi.advanceTimersByTime(100));
            rerender({ value: 'a' });

            expect(result.current.isPending).toBe(false);
        });

        it('flush commits the latest value immediately', () => {
            const { result, rerender } = renderControlled('a');

            rerender({ value: 'b' });
            act(() => result.current.flush());

            expect(result.current.value).toBe('b');
            expect(result.current.isPending).toBe(false);
        });

        it('flush does not fire the scheduled update a second time', () => {
            const { result, rerender } = renderControlled('a');

            rerender({ value: 'b' });
            act(() => result.current.flush());
            rerender({ value: 'c' });
            act(() => result.current.flush());
            act(() => vi.advanceTimersByTime(1000));

            expect(result.current.value).toBe('c');
        });

        it('flush on a settled value is a no-op', () => {
            const { result } = renderControlled('a');

            act(() => result.current.flush());
            expect(result.current.value).toBe('a');
            expect(result.current.isPending).toBe(false);
        });

        it('cancel drops the pending update for good', () => {
            const { result, rerender } = renderControlled('a');

            rerender({ value: 'b' });
            act(() => result.current.cancel());

            expect(result.current.isPending).toBe(false);

            act(() => vi.advanceTimersByTime(1000));
            expect(result.current.value).toBe('a');
        });

        it('debounces again after a cancel when the value changes', () => {
            const { result, rerender } = renderControlled('a');

            rerender({ value: 'b' });
            act(() => result.current.cancel());
            rerender({ value: 'c' });

            act(() => vi.advanceTimersByTime(299));
            expect(result.current.value).toBe('a');

            act(() => vi.advanceTimersByTime(1));
            expect(result.current.value).toBe('c');
            expect(result.current.isPending).toBe(false);
        });

        it('reports isPending again after a cancelled update resumes', () => {
            const { result, rerender } = renderControlled('a');

            rerender({ value: 'b' });
            act(() => result.current.cancel());
            act(() => rerender({ value: 'c' }));

            expect(result.current.isPending).toBe(true);
        });

        it('flush commits a value that was cancelled', () => {
            const { result, rerender } = renderControlled('a');

            rerender({ value: 'b' });
            act(() => result.current.cancel());
            act(() => result.current.flush());

            expect(result.current.value).toBe('b');
            expect(result.current.isPending).toBe(false);
        });

        it('cancel restarts the maxWaitMs window instead of shortening the next run', () => {
            const { result, rerender } = renderHook(
                ({ value }) => useDebouncedValue(value, 300, { maxWaitMs: 1000, controls: true }),
                { initialProps: { value: 'a' } }
            );
            const type = (value: string) => {
                rerender({ value });
                act(() => vi.advanceTimersByTime(200));
            };

            type('a1');
            type('a2');
            type('a3');
            expect(result.current.value).toBe('a');

            act(() => result.current.cancel());

            type('a4');
            type('a5');
            type('a6');
            expect(result.current.value).toBe('a');

            act(() => vi.advanceTimersByTime(300));
            expect(result.current.value).toBe('a6');
        });

        it('keeps flush and cancel stable across renders', () => {
            const { result, rerender } = renderControlled('a');
            const first = { flush: result.current.flush, cancel: result.current.cancel };

            rerender({ value: 'b' });
            act(() => vi.advanceTimersByTime(300));

            expect(result.current.flush).toBe(first.flush);
            expect(result.current.cancel).toBe(first.cancel);
        });

        it('does not update after unmount', () => {
            const { result, rerender, unmount } = renderControlled('a');
            const { flush } = result.current;

            rerender({ value: 'b' });
            unmount();

            expect(() => act(() => flush())).not.toThrow();
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

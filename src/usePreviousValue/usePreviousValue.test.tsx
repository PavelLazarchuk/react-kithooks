import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { usePreviousValue } from './index';

describe('usePreviousValue', () => {
    it('returns undefined before the value has ever changed', () => {
        const { result, rerender } = renderHook(({ v }) => usePreviousValue(v), {
            initialProps: { v: 1 },
        });
        expect(result.current).toBeUndefined();

        rerender({ v: 1 });
        expect(result.current).toBeUndefined();
    });

    it('returns the previous value after a change', () => {
        const { result, rerender } = renderHook(({ v }) => usePreviousValue(v), {
            initialProps: { v: 1 },
        });

        rerender({ v: 2 });
        expect(result.current).toBe(1);

        rerender({ v: 3 });
        expect(result.current).toBe(2);
    });

    it('keeps the previous DISTINCT value across unrelated re-renders', () => {
        const { result, rerender } = renderHook(({ v }) => usePreviousValue(v), {
            initialProps: { v: 'a' },
        });

        rerender({ v: 'b' });
        expect(result.current).toBe('a');

        rerender({ v: 'b' });
        rerender({ v: 'b' });
        expect(result.current).toBe('a');
    });

    it('compares with Object.is — a new but deep-equal object counts as a change', () => {
        const first = { n: 1 };
        const second = { n: 1 };
        const { result, rerender } = renderHook(({ v }) => usePreviousValue(v), {
            initialProps: { v: first },
        });

        rerender({ v: second });
        expect(result.current).toBe(first);
    });

    it('handles NaN like Object.is (NaN → NaN is not a change)', () => {
        const { result, rerender } = renderHook(({ v }) => usePreviousValue(v), {
            initialProps: { v: NaN },
        });

        rerender({ v: NaN });
        expect(result.current).toBeUndefined();

        rerender({ v: 5 });
        expect(result.current).toBeNaN();
    });
});

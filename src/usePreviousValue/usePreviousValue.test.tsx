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

    it('treats a deep-equal object as unchanged when given a comparator', () => {
        const first = { n: 1 };
        const second = { n: 1 };
        const third = { n: 2 };
        const isEqual = (a: { n: number }, b: { n: number }) => a.n === b.n;

        const { result, rerender } = renderHook(({ v }) => usePreviousValue(v, isEqual), {
            initialProps: { v: first },
        });

        rerender({ v: second });
        expect(result.current).toBeUndefined();

        rerender({ v: third });
        expect(result.current).toBe(first);

        rerender({ v: { n: 2 } });
        expect(result.current).toBe(first);
    });

    it('keeps the reference that was actually rendered, not a copy of it', () => {
        const first = { id: 1, label: 'a' };
        const relabeled = { id: 1, label: 'b' };
        const next = { id: 2, label: 'c' };
        const byId = (a: { id: number }, b: { id: number }) => a.id === b.id;

        const { result, rerender } = renderHook(({ v }) => usePreviousValue(v, byId), {
            initialProps: { v: first },
        });

        rerender({ v: relabeled });
        rerender({ v: next });
        expect(result.current).toBe(first);
    });

    it('picks up a comparator swapped between renders', () => {
        const always = () => true;
        const never = () => false;

        const { result, rerender } = renderHook(
            ({ v, isEqual }: { v: number; isEqual: () => boolean }) => usePreviousValue(v, isEqual),
            { initialProps: { v: 1, isEqual: always } }
        );

        rerender({ v: 2, isEqual: always });
        expect(result.current).toBeUndefined();

        rerender({ v: 3, isEqual: never });
        expect(result.current).toBe(1);
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

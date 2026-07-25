import { describe, expect, it } from 'vitest';
import { StrictMode, useState } from 'react';
import { act, render, renderHook } from '@testing-library/react';

import { useIsFirstRender } from './index';

describe('useIsFirstRender', () => {
    it('is true on the first render and false afterwards', () => {
        const { result, rerender } = renderHook(() => useIsFirstRender());
        expect(result.current).toBe(true);

        rerender();
        expect(result.current).toBe(false);
    });

    it('stays false across many subsequent renders', () => {
        const { result, rerender } = renderHook(() => useIsFirstRender());
        rerender();
        rerender();
        rerender();
        expect(result.current).toBe(false);
    });

    it('reports true for BOTH StrictMode dev double-renders (dev/prod consistency)', () => {
        const seen: boolean[] = [];
        let bump: () => void = () => undefined;

        function Probe() {
            seen.push(useIsFirstRender());
            const [, setTick] = useState(0);
            bump = () => setTick(t => t + 1);
            return null;
        }

        render(
            <StrictMode>
                <Probe />
            </StrictMode>
        );
        expect(seen.length).toBeGreaterThanOrEqual(2);
        expect(seen.every(v => v === true)).toBe(true);

        seen.length = 0;
        act(() => bump());
        expect(seen.length).toBeGreaterThanOrEqual(1);
        expect(seen.every(v => v === false)).toBe(true);
    });
});

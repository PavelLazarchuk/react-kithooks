import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { usePrefersReducedMotion } from './index';
import { installMatchMedia } from '../useMediaQuery/matchMedia.mock';
import { resetMediaQueryListsForTests } from '../useMediaQuery/store';

const QUERY = '(prefers-reduced-motion: reduce)';

describe('usePrefersReducedMotion', () => {
    beforeEach(() => {
        resetMediaQueryListsForTests();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('is false when the user has expressed no preference', () => {
        installMatchMedia();

        expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
    });

    it('is true when reduced motion is requested', () => {
        const media = installMatchMedia();
        media.setMatches(QUERY, true);

        expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(true);
    });

    it('reacts to the preference changing mid-session', () => {
        const media = installMatchMedia();
        const { result } = renderHook(() => usePrefersReducedMotion());

        act(() => media.setMatches(QUERY, true));
        expect(result.current).toBe(true);

        act(() => media.setMatches(QUERY, false));
        expect(result.current).toBe(false);
    });

    it('shares one MediaQueryList with useMediaQuery readers', () => {
        const media = installMatchMedia();

        renderHook(() => usePrefersReducedMotion());
        renderHook(() => usePrefersReducedMotion());

        expect(media.matchMediaCalls()).toBe(1);
        expect(media.listenerCount(QUERY)).toBe(2);
    });

    it('leaves no listener behind on unmount', () => {
        const media = installMatchMedia();

        renderHook(() => usePrefersReducedMotion()).unmount();

        expect(media.listenerCount(QUERY)).toBe(0);
    });

    it('is false where matchMedia is unavailable', () => {
        vi.stubGlobal('matchMedia', undefined);

        expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
    });

    it('server-renders serverFallback, defaulting to false', () => {
        function Probe({ fallback }: { fallback?: boolean }) {
            return <span>{String(usePrefersReducedMotion({ serverFallback: fallback }))}</span>;
        }

        expect(renderToString(<Probe />)).toContain('false');
        expect(renderToString(<Probe fallback />)).toContain('true');
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { usePrefersColorScheme } from './index';
import { installMatchMedia } from '../useMediaQuery/matchMedia.mock';
import { resetMediaQueryListsForTests } from '../useMediaQuery/store';

const DARK = '(prefers-color-scheme: dark)';

describe('usePrefersColorScheme', () => {
    beforeEach(() => {
        resetMediaQueryListsForTests();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("is 'light' when the dark query does not match", () => {
        installMatchMedia();

        expect(renderHook(() => usePrefersColorScheme()).result.current).toBe('light');
    });

    it("is 'dark' when the dark query matches", () => {
        const media = installMatchMedia();
        media.setMatches(DARK, true);

        expect(renderHook(() => usePrefersColorScheme()).result.current).toBe('dark');
    });

    it('follows the system flipping the scheme', () => {
        const media = installMatchMedia();
        const { result } = renderHook(() => usePrefersColorScheme());

        act(() => media.setMatches(DARK, true));
        expect(result.current).toBe('dark');

        act(() => media.setMatches(DARK, false));
        expect(result.current).toBe('light');
    });

    it('only ever evaluates the dark query', () => {
        const media = installMatchMedia();

        renderHook(() => usePrefersColorScheme());

        expect(media.matchMediaCalls()).toBe(1);
        expect(media.listenerCount(DARK)).toBe(1);
    });

    it('leaves no listener behind on unmount', () => {
        const media = installMatchMedia();

        renderHook(() => usePrefersColorScheme()).unmount();

        expect(media.listenerCount(DARK)).toBe(0);
    });

    it("is 'light' where matchMedia is unavailable", () => {
        vi.stubGlobal('matchMedia', undefined);

        expect(renderHook(() => usePrefersColorScheme()).result.current).toBe('light');
    });

    it("server-renders serverFallback, defaulting to 'light'", () => {
        function Probe({ fallback }: { fallback?: 'light' | 'dark' }) {
            return <span>{usePrefersColorScheme({ serverFallback: fallback })}</span>;
        }

        expect(renderToString(<Probe />)).toContain('light');
        expect(renderToString(<Probe fallback="dark" />)).toContain('dark');
    });
});

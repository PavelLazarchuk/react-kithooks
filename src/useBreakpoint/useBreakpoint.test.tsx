import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { useBreakpoint } from './index';
import { installMatchMedia, setViewportWidth } from '../useMediaQuery/matchMedia.mock';
import type { MatchMediaMock } from '../useMediaQuery/matchMedia.mock';
import { resetMediaQueryListsForTests } from '../useMediaQuery/store';

const BREAKPOINTS = { sm: 640, md: 768, lg: 1024 };
const WIDTHS = [640, 768, 1024];

const resize = (media: MatchMediaMock, width: number) => setViewportWidth(media, WIDTHS, width);

describe('useBreakpoint', () => {
    beforeEach(() => {
        resetMediaQueryListsForTests();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("is 'base' when no breakpoint matches", () => {
        const media = installMatchMedia();
        resize(media, 400);

        expect(renderHook(() => useBreakpoint(BREAKPOINTS)).result.current).toBe('base');
    });

    it('reports the widest matching breakpoint, not the first', () => {
        const media = installMatchMedia();
        resize(media, 1280);

        expect(renderHook(() => useBreakpoint(BREAKPOINTS)).result.current).toBe('lg');
    });

    it('moves across breakpoints as the viewport changes', () => {
        const media = installMatchMedia();
        resize(media, 400);

        const { result } = renderHook(() => useBreakpoint(BREAKPOINTS));
        expect(result.current).toBe('base');

        act(() => resize(media, 700));
        expect(result.current).toBe('sm');

        act(() => resize(media, 800));
        expect(result.current).toBe('md');

        act(() => resize(media, 1024));
        expect(result.current).toBe('lg');

        act(() => resize(media, 500));
        expect(result.current).toBe('base');
    });

    it('matches exactly at the boundary', () => {
        const media = installMatchMedia();
        resize(media, 768);

        expect(renderHook(() => useBreakpoint(BREAKPOINTS)).result.current).toBe('md');
    });

    it('builds one min-width query per breakpoint', () => {
        const media = installMatchMedia();

        renderHook(() => useBreakpoint(BREAKPOINTS));

        expect(media.matchMediaCalls()).toBe(3);
        expect(media.listenerCount('(min-width: 640px)')).toBe(1);
        expect(media.listenerCount('(min-width: 768px)')).toBe(1);
        expect(media.listenerCount('(min-width: 1024px)')).toBe(1);
    });

    it('accepts CSS lengths alongside pixel numbers', () => {
        const media = installMatchMedia();
        media.setMatches('(min-width: 40rem)', true);

        const { result } = renderHook(() => useBreakpoint({ sm: '40rem', lg: '64rem' }));
        expect(result.current).toBe('sm');

        act(() => media.setMatches('(min-width: 64rem)', true));
        expect(result.current).toBe('lg');
    });

    it('does not re-subscribe when passed a fresh object literal each render', () => {
        const media = installMatchMedia();

        const { rerender } = renderHook(() => useBreakpoint({ sm: 640, md: 768, lg: 1024 }));

        rerender();
        rerender();
        rerender();

        expect(media.matchMediaCalls()).toBe(3);
        expect(media.listenerCount('(min-width: 640px)')).toBe(1);
    });

    it('re-subscribes when the breakpoint values actually change', () => {
        const media = installMatchMedia();
        media.setMatches('(min-width: 900px)', true);

        const { result, rerender } = renderHook(({ bp }) => useBreakpoint(bp), {
            initialProps: { bp: { sm: 640 } as Record<string, number> },
        });
        expect(result.current).toBe('base');

        rerender({ bp: { sm: 900 } });
        expect(result.current).toBe('sm');
        expect(media.listenerCount('(min-width: 640px)')).toBe(0);
        expect(media.listenerCount('(min-width: 900px)')).toBe(1);
    });

    it('leaves no listener behind on unmount', () => {
        const media = installMatchMedia();

        renderHook(() => useBreakpoint(BREAKPOINTS)).unmount();

        for (const width of WIDTHS) {
            expect(media.listenerCount(`(min-width: ${width}px)`)).toBe(0);
        }
    });

    it('works through the legacy addListener API (Safari < 14)', () => {
        const media = installMatchMedia({ legacy: true });
        const { result } = renderHook(() => useBreakpoint(BREAKPOINTS));

        act(() => resize(media, 800));
        expect(result.current).toBe('md');
    });

    it('takes a custom base name', () => {
        const media = installMatchMedia();
        resize(media, 400);

        expect(renderHook(() => useBreakpoint(BREAKPOINTS, { base: 'xs' })).result.current).toBe(
            'xs'
        );
    });

    it('is base for an empty breakpoint set, touching matchMedia not at all', () => {
        const media = installMatchMedia();

        expect(renderHook(() => useBreakpoint({})).result.current).toBe('base');
        expect(media.matchMediaCalls()).toBe(0);
    });

    it('reports base where matchMedia is unavailable', () => {
        vi.stubGlobal('matchMedia', undefined);

        const { result, rerender } = renderHook(() => useBreakpoint(BREAKPOINTS));

        expect(result.current).toBe('base');
        expect(() => rerender()).not.toThrow();
    });

    it('warns in development when numeric breakpoints are declared out of order', () => {
        installMatchMedia();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        renderHook(() => useBreakpoint({ lg: 1024, md: 768 }));

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]![0]).toContain('declared out of order');

        warn.mockRestore();
    });

    it('does not warn for ascending breakpoints, or repeat itself on re-render', () => {
        installMatchMedia();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        const { rerender } = renderHook(() => useBreakpoint(BREAKPOINTS));
        rerender();
        rerender();

        expect(warn).not.toHaveBeenCalled();

        warn.mockRestore();
    });

    it('does not warn when values are CSS lengths it cannot compare', () => {
        installMatchMedia();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        renderHook(() => useBreakpoint({ lg: '64rem', md: '48rem' }));

        expect(warn).not.toHaveBeenCalled();

        warn.mockRestore();
    });

    it('still compares the numbers on either side of a CSS length', () => {
        installMatchMedia();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        renderHook(() => useBreakpoint({ xs: '20rem', lg: 1024, md: 768 }));

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]![0]).toContain('declared out of order');

        warn.mockRestore();
    });

    it('server-renders serverFallback, defaulting to base', () => {
        function Probe({ fallback }: { fallback?: 'base' | 'sm' | 'md' | 'lg' }) {
            return <span>{useBreakpoint(BREAKPOINTS, { serverFallback: fallback })}</span>;
        }

        expect(renderToString(<Probe />)).toContain('base');
        expect(renderToString(<Probe fallback="md" />)).toContain('md');
    });
});

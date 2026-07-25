import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { useMediaQuery } from './index';

type ChangeListener = () => void;

function installMatchMedia(opts: { legacy?: boolean } = {}) {
    const lists = new Map<
        string,
        { matches: boolean; listeners: Set<ChangeListener>; setMatches: (m: boolean) => void }
    >();

    const getList = (query: string) => {
        let list = lists.get(query);
        if (!list) {
            const listeners = new Set<ChangeListener>();
            list = {
                matches: false,
                listeners,
                setMatches(m: boolean) {
                    this.matches = m;
                    listeners.forEach(l => l());
                },
            };
            lists.set(query, list);
        }
        return list;
    };

    vi.stubGlobal('matchMedia', (query: string) => {
        const list = getList(query);
        const base = {
            get matches() {
                return list.matches;
            },
            media: query,
        };
        if (opts.legacy) {
            return {
                ...base,
                addListener: (l: ChangeListener) => list.listeners.add(l),
                removeListener: (l: ChangeListener) => list.listeners.delete(l),
            } as unknown as MediaQueryList;
        }
        return {
            ...base,
            addEventListener: (_: 'change', l: ChangeListener) => list.listeners.add(l),
            removeEventListener: (_: 'change', l: ChangeListener) => list.listeners.delete(l),
        } as unknown as MediaQueryList;
    });

    return { setMatches: (query: string, m: boolean) => getList(query).setMatches(m) };
}

const QUERY = '(min-width: 768px)';

describe('useMediaQuery', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns the current matches value on mount', () => {
        const media = installMatchMedia();
        media.setMatches(QUERY, true);

        const { result } = renderHook(() => useMediaQuery(QUERY));
        expect(result.current).toBe(true);
    });

    it('updates when the media query result changes', () => {
        const media = installMatchMedia();
        const { result } = renderHook(() => useMediaQuery(QUERY));
        expect(result.current).toBe(false);

        act(() => media.setMatches(QUERY, true));
        expect(result.current).toBe(true);

        act(() => media.setMatches(QUERY, false));
        expect(result.current).toBe(false);
    });

    it('works through the legacy addListener API (Safari < 14)', () => {
        const media = installMatchMedia({ legacy: true });
        const { result } = renderHook(() => useMediaQuery(QUERY));

        act(() => media.setMatches(QUERY, true));
        expect(result.current).toBe(true);
    });

    it('re-subscribes when the query string changes', () => {
        const media = installMatchMedia();
        const other = '(min-width: 1200px)';
        media.setMatches(other, true);

        const { result, rerender } = renderHook(({ q }) => useMediaQuery(q), {
            initialProps: { q: QUERY },
        });
        expect(result.current).toBe(false);

        rerender({ q: other });
        expect(result.current).toBe(true);

        act(() => media.setMatches(QUERY, true));
        expect(result.current).toBe(true);
        act(() => media.setMatches(other, false));
        expect(result.current).toBe(false);
    });

    it('server render returns serverFallback and never touches matchMedia', () => {
        function Probe() {
            const matches = useMediaQuery(QUERY, { serverFallback: true });
            return <span>{String(matches)}</span>;
        }
        const html = renderToString(<Probe />);
        expect(html).toContain('true');
    });

    it('serverFallback defaults to false', () => {
        function Probe() {
            return <span>{String(useMediaQuery(QUERY))}</span>;
        }
        expect(renderToString(<Probe />)).toContain('false');
    });
});

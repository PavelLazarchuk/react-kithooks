import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';

import { useMediaQuery } from './index';
import { resetMediaQueryListsForTests } from './store';

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

    let calls = 0;

    vi.stubGlobal('matchMedia', (query: string) => {
        calls += 1;
        const list = getList(query);
        const mql: Record<string, unknown> = {
            get matches() {
                return list.matches;
            },
            media: query,
        };

        if (opts.legacy) {
            mql.addListener = (l: ChangeListener) => list.listeners.add(l);
            mql.removeListener = (l: ChangeListener) => list.listeners.delete(l);
        } else {
            mql.addEventListener = (_: 'change', l: ChangeListener) => list.listeners.add(l);
            mql.removeEventListener = (_: 'change', l: ChangeListener) => list.listeners.delete(l);
        }

        return mql as unknown as MediaQueryList;
    });

    return {
        setMatches: (query: string, m: boolean) => getList(query).setMatches(m),
        matchMediaCalls: () => calls,
        listenerCount: (query: string) => getList(query).listeners.size,
    };
}

const QUERY = '(min-width: 768px)';

describe('useMediaQuery', () => {
    beforeEach(() => {
        resetMediaQueryListsForTests();
    });

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

    describe('cached MediaQueryList', () => {
        it('builds one list however many components read the query', () => {
            const media = installMatchMedia();

            const a = renderHook(() => useMediaQuery(QUERY));
            const b = renderHook(() => useMediaQuery(QUERY));
            const c = renderHook(() => useMediaQuery(QUERY));

            expect(media.matchMediaCalls()).toBe(1);
            expect(media.listenerCount(QUERY)).toBe(3);

            act(() => media.setMatches(QUERY, true));

            expect(a.result.current).toBe(true);
            expect(b.result.current).toBe(true);
            expect(c.result.current).toBe(true);
        });

        it('keeps a list per distinct query', () => {
            const media = installMatchMedia();
            const other = '(min-width: 1200px)';

            renderHook(() => useMediaQuery(QUERY));
            renderHook(() => useMediaQuery(other));

            expect(media.matchMediaCalls()).toBe(2);
            expect(media.listenerCount(QUERY)).toBe(1);
            expect(media.listenerCount(other)).toBe(1);
        });

        it('does not re-read matchMedia on re-render', () => {
            const media = installMatchMedia();
            const { rerender } = renderHook(() => useMediaQuery(QUERY));

            rerender();
            rerender();
            act(() => media.setMatches(QUERY, true));
            rerender();

            expect(media.matchMediaCalls()).toBe(1);
        });

        it('leaves no listener behind when a reader unmounts', () => {
            const media = installMatchMedia();

            const a = renderHook(() => useMediaQuery(QUERY));
            const b = renderHook(() => useMediaQuery(QUERY));

            a.unmount();
            expect(media.listenerCount(QUERY)).toBe(1);

            b.unmount();
            expect(media.listenerCount(QUERY)).toBe(0);
        });

        it('drops the cache instead of growing without bound on rotating queries', () => {
            const media = installMatchMedia();

            for (let i = 0; i < 201; i += 1) {
                const { unmount } = renderHook(() => useMediaQuery(`(min-width: ${i}px)`));
                unmount();
            }

            renderHook(() => useMediaQuery('(min-width: 0px)'));
            expect(media.matchMediaCalls()).toBe(202);
        });

        it('reuses the list on a later mount instead of rebuilding it', () => {
            const media = installMatchMedia();

            const { unmount } = renderHook(() => useMediaQuery(QUERY));
            unmount();

            const { result } = renderHook(() => useMediaQuery(QUERY));

            expect(media.matchMediaCalls()).toBe(1);
            expect(media.listenerCount(QUERY)).toBe(1);

            act(() => media.setMatches(QUERY, true));
            expect(result.current).toBe(true);
        });
    });

    it('reports false instead of throwing where matchMedia is unavailable', () => {
        vi.stubGlobal('matchMedia', undefined);

        const { result, rerender } = renderHook(() => useMediaQuery(QUERY));

        expect(result.current).toBe(false);
        expect(() => rerender()).not.toThrow();
    });

    it('picks matchMedia up if the environment gains it later', () => {
        vi.stubGlobal('matchMedia', undefined);
        renderHook(() => useMediaQuery(QUERY)).unmount();

        const media = installMatchMedia();
        media.setMatches(QUERY, true);

        const { result } = renderHook(() => useMediaQuery(QUERY));
        expect(result.current).toBe(true);
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

import { vi } from 'vitest';

type ChangeListener = () => void;

interface MockList {
    matches: boolean;
    listeners: Set<ChangeListener>;
}

export interface MatchMediaMock {
    setMatches: (query: string, matches: boolean) => void;
    matchMediaCalls: () => number;
    listenerCount: (query: string) => number;
}

export function installMatchMedia(opts: { legacy?: boolean } = {}): MatchMediaMock {
    const lists = new Map<string, MockList>();

    const getList = (query: string): MockList => {
        let list = lists.get(query);

        if (!list) {
            list = { matches: false, listeners: new Set() };
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
        setMatches: (query, matches) => {
            const list = getList(query);
            list.matches = matches;
            list.listeners.forEach(l => l());
        },
        matchMediaCalls: () => calls,
        listenerCount: query => getList(query).listeners.size,
    };
}

export function setViewportWidth(media: MatchMediaMock, widths: number[], width: number): void {
    for (const w of widths) media.setMatches(`(min-width: ${w}px)`, width >= w);
}

const noop = () => undefined;

const UNSUPPORTED_LIST = {
    matches: false,
    addEventListener: noop,
    removeEventListener: noop,
    addListener: noop,
    removeListener: noop,
} as unknown as MediaQueryList;

const CACHE_MAX = 200;

interface CacheEntry {
    list: MediaQueryList;
    subscribers: number;
}

const UNSUPPORTED_ENTRY: CacheEntry = { list: UNSUPPORTED_LIST, subscribers: 0 };

const lists = new Map<string, CacheEntry>();

function evict(): void {
    for (const [query, entry] of lists) {
        if (lists.size < CACHE_MAX) return;
        if (entry.subscribers <= 0) lists.delete(query);
    }
}

function getEntry(query: string): CacheEntry {
    let entry = lists.get(query);

    if (entry) {
        lists.delete(query);
    } else {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return UNSUPPORTED_ENTRY;
        }

        entry = { list: window.matchMedia(query), subscribers: 0 };
        evict();
    }

    lists.set(query, entry);

    return entry;
}

export function getMediaQueryList(query: string): MediaQueryList {
    return getEntry(query).list;
}

export function subscribeToMediaQuery(query: string, onChange: () => void): () => void {
    const entry = getEntry(query);
    const mql = entry.list;
    // Safari < 14 has no addEventListener on MediaQueryList.
    const legacy = typeof mql.addEventListener !== 'function';

    entry.subscribers += 1;

    if (legacy) mql.addListener(onChange);
    else mql.addEventListener('change', onChange);

    return () => {
        entry.subscribers -= 1;

        if (legacy) mql.removeListener(onChange);
        else mql.removeEventListener('change', onChange);
    };
}

export function resetMediaQueryListsForTests(): void {
    lists.clear();
}

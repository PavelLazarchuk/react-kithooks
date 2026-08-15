const noop = () => undefined;

const UNSUPPORTED_LIST = {
    matches: false,
    addEventListener: noop,
    removeEventListener: noop,
    addListener: noop,
    removeListener: noop,
} as unknown as MediaQueryList;

const CACHE_MAX = 200;

const lists = new Map<string, MediaQueryList>();

export function getMediaQueryList(query: string): MediaQueryList {
    let list = lists.get(query);

    if (!list) {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return UNSUPPORTED_LIST;
        }

        list = window.matchMedia(query);

        if (lists.size >= CACHE_MAX) lists.clear();

        lists.set(query, list);
    }

    return list;
}

export function subscribeToMediaQuery(query: string, onChange: () => void): () => void {
    const mql = getMediaQueryList(query);

    if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onChange);

        return () => mql.removeEventListener('change', onChange);
    }

    // Safari < 14
    mql.addListener(onChange);

    return () => mql.removeListener(onChange);
}

export function resetMediaQueryListsForTests(): void {
    lists.clear();
}

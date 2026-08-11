const lists = new Map<string, MediaQueryList>();

export function getMediaQueryList(query: string): MediaQueryList {
    let list = lists.get(query);

    if (!list) {
        list = window.matchMedia(query);
        lists.set(query, list);
    }

    return list;
}

export function resetMediaQueryListsForTests(): void {
    lists.clear();
}

export interface KeyedCache<K, V> {
    get: (key: K) => V;
    peek: (key: K) => V | undefined;
    delete: (key: K) => void;
    reset: () => void;
    values: () => IterableIterator<V>;
}

export function createKeyedCache<K, V>(factory: (key: K) => V): KeyedCache<K, V> {
    const cache = new Map<K, V>();

    return {
        get: key => {
            if (!cache.has(key)) cache.set(key, factory(key));

            return cache.get(key) as V;
        },
        peek: key => cache.get(key),
        delete: key => {
            cache.delete(key);
        },
        reset: () => cache.clear(),
        values: () => cache.values(),
    };
}

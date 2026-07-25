export interface KeyedCache<K, V> {
    get: (key: K) => V;
    peek: (key: K) => V | undefined;
    delete: (key: K) => void;
    reset: () => void;
}

export function createKeyedCache<K, V>(factory: (key: K) => V): KeyedCache<K, V> {
    const cache = new Map<K, V>();

    return {
        get: key => {
            let value = cache.get(key);

            if (!value) {
                value = factory(key);
                cache.set(key, value);
            }

            return value;
        },
        peek: key => cache.get(key),
        delete: key => {
            cache.delete(key);
        },
        reset: () => cache.clear(),
    };
}

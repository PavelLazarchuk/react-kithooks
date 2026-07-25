export interface KeyedCache<K, V> {
    get: (key: K) => V;
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
        reset: () => cache.clear(),
    };
}

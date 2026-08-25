import { describe, expect, it } from 'vitest';

import { createWebStorageStoreCache } from './webStorageStore';

function createFakeStorage() {
    const raw = new Map<string, string>();
    let failNextSet = false;

    const storage = {
        getItem: (key: string) => (raw.has(key) ? raw.get(key)! : null),
        setItem: (key: string, value: string) => {
            if (failNextSet) {
                failNextSet = false;
                throw new DOMException('full', 'QuotaExceededError');
            }

            raw.set(key, value);
        },
        removeItem: (key: string) => {
            raw.delete(key);
        },
    } as unknown as Storage;

    return {
        storage,
        raw,
        failNext: () => {
            failNextSet = true;
        },
    };
}

describe('webStorageStore', () => {
    it('a transient write failure does not permanently disable resync or leak the cache entry', async () => {
        const fake = createFakeStorage();
        const cache = createWebStorageStoreCache(() => fake.storage);

        const store = cache.get('k');
        const unsub1 = store.subscribe(() => undefined);

        fake.failNext();
        store.set('bad-write');
        expect(store.getSnapshot()).toBe('bad-write');

        unsub1();
        await Promise.resolve();
        expect(cache.get('k')).toBe(store);

        store.set('recovered');
        expect(fake.raw.get('k')).toBe('recovered');

        fake.raw.set('k', 'external-write');

        const unsub2 = store.subscribe(() => undefined);
        expect(store.getSnapshot()).toBe('external-write');
        unsub2();

        await Promise.resolve();
        expect(cache.get('k')).not.toBe(store);
    });
});

import { createKeyedCache } from './keyedCache';
import { createLazyStore } from './lazyStore';

export interface WebStorageStore {
    getSnapshot: () => string | null;
    subscribe: (listener: () => void) => () => void;
    set: (raw: string | null) => void;
}

export interface WebStorageStoreCache {
    get: (key: string) => WebStorageStore;
    reset: () => void;
}

function readRaw(storage: Storage, key: string): string | null {
    try {
        return storage.getItem(key);
    } catch {
        return null;
    }
}

function createWebStorageStore(getStorage: () => Storage, key: string): WebStorageStore {
    let snapshot: string | null = typeof window === 'undefined' ? null : readRaw(getStorage(), key);
    let storageHandler: ((event: StorageEvent) => void) | null = null;

    const set = (raw: string | null) => {
        const storage = getStorage();

        try {
            if (raw === null) {
                storage.removeItem(key);
            } else {
                storage.setItem(key, raw);
            }
        } catch {
            return;
        }

        if (snapshot === raw) return;

        snapshot = raw;
        lazyStore.notify();
    };

    const attachStorageListener = () => {
        if (storageHandler || typeof window === 'undefined') return;

        storageHandler = (event: StorageEvent) => {
            if (event.storageArea && event.storageArea !== getStorage()) return;
            if (event.key !== null && event.key !== key) return;

            const next = event.key === null ? null : event.newValue;

            if (next === snapshot) return;

            snapshot = next;
            lazyStore.notify();
        };
        window.addEventListener('storage', storageHandler);
    };

    const detachStorageListener = () => {
        if (!storageHandler || typeof window === 'undefined') return;

        window.removeEventListener('storage', storageHandler);
        storageHandler = null;
    };

    const lazyStore = createLazyStore(attachStorageListener, detachStorageListener);

    return {
        getSnapshot: () => snapshot,
        subscribe: lazyStore.subscribe,
        set,
    };
}

export function createWebStorageStoreCache(getStorage: () => Storage): WebStorageStoreCache {
    const stores = createKeyedCache((key: string) => createWebStorageStore(getStorage, key));

    return {
        get: stores.get,
        reset: stores.reset,
    };
}

import { createDisposeScheduler } from './disposeWhenUnused';
import { createKeyedCache } from './keyedCache';
import { createLazyStore } from './lazyStore';

export interface WebStorageStore {
    getSnapshot: () => string | null;
    getLocalSnapshot: () => string | null;
    subscribe: (listener: () => void) => () => void;
    set: (raw: string | null) => void;
}

export interface WebStorageStoreCache {
    get: (key: string) => WebStorageStore;
    reset: () => void;
}

function safeStorage(getStorage: () => Storage): Storage | null {
    try {
        return getStorage();
    } catch {
        return null;
    }
}

function readRaw(getStorage: () => Storage, key: string): string | null {
    const storage = safeStorage(getStorage);

    if (!storage) return null;

    try {
        return storage.getItem(key);
    } catch {
        return null;
    }
}

function createWebStorageStore(
    getStorage: () => Storage,
    key: string,
    onDisposable: (store: WebStorageStore) => void
): WebStorageStore {
    let snapshot: string | null = typeof window === 'undefined' ? null : readRaw(getStorage, key);
    let localSnapshot = snapshot;
    let storageHandler: ((event: StorageEvent) => void) | null = null;
    let memoryOnly = false;

    const set = (raw: string | null) => {
        const storage = safeStorage(getStorage);

        if (storage) {
            try {
                if (raw === null) {
                    storage.removeItem(key);
                } else {
                    storage.setItem(key, raw);
                }
                memoryOnly = false;
            } catch {
                memoryOnly = true;
            }
        } else {
            memoryOnly = true;
        }

        if (snapshot === raw && localSnapshot === raw) return;

        snapshot = raw;
        localSnapshot = raw;
        lazyStore.notify();
    };

    const attachStorageListener = () => {
        if (storageHandler || typeof window === 'undefined') return;

        storageHandler = (event: StorageEvent) => {
            const storage = safeStorage(getStorage);

            if (event.storageArea && storage && event.storageArea !== storage) return;
            if (event.key !== null && event.key !== key) return;

            const next = event.key === null ? null : event.newValue;

            if (next === snapshot) return;

            snapshot = next;
            lazyStore.notify();
        };
        window.addEventListener('storage', storageHandler);

        if (memoryOnly) return;

        const next = readRaw(getStorage, key);

        if (next === snapshot && next === localSnapshot) return;

        snapshot = next;
        localSnapshot = next;
        lazyStore.notify();
    };

    const detachStorageListener = () => {
        if (!storageHandler || typeof window === 'undefined') return;

        window.removeEventListener('storage', storageHandler);
        storageHandler = null;
    };

    const store: WebStorageStore = {
        getSnapshot: () => snapshot,
        getLocalSnapshot: () => localSnapshot,
        subscribe: listener => lazyStore.subscribe(listener),
        set,
    };

    const scheduleDispose = createDisposeScheduler(
        () => lazyStore.size === 0 && !memoryOnly,
        () => onDisposable(store)
    );

    const lazyStore = createLazyStore(attachStorageListener, () => {
        detachStorageListener();
        scheduleDispose();
    });

    return store;
}

export function createWebStorageStoreCache(getStorage: () => Storage): WebStorageStoreCache {
    const stores = createKeyedCache((key: string) =>
        createWebStorageStore(getStorage, key, store => {
            if (stores.peek(key) === store) stores.delete(key);
        })
    );

    return {
        get: stores.get,
        reset: stores.reset,
    };
}

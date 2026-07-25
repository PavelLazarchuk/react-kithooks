import { idbGet, idbRemove, idbSet, idbSupported } from './db';
import { createKeyedCache } from '../internal/keyedCache';
import { createLazyStore } from '../internal/lazyStore';

export type IndexedDBStatus = 'loading' | 'ready' | 'error' | 'unsupported';

export interface IndexedDBEntry<T> {
    status: IndexedDBStatus;
    value: T | undefined;
}

export interface IndexedDBStore<T> {
    getSnapshot: () => IndexedDBEntry<T>;
    subscribe: (listener: () => void) => () => void;
    set: (value: T) => Promise<void>;
    remove: () => Promise<void>;
}

export function channelName(dbName: string, storeName: string, key: string): string {
    return ['react-kithooks:idb', dbName, storeName, key].join(':');
}

function createStore<T>(dbName: string, storeName: string, key: string): IndexedDBStore<T> {
    let entry: IndexedDBEntry<T> = { status: 'loading', value: undefined };
    let channel: BroadcastChannel | null = null;

    const load = async () => {
        if (!idbSupported()) {
            entry = { status: 'unsupported', value: undefined };
            lazyStore.notify();
            return;
        }

        try {
            const value = await idbGet<T>(dbName, storeName, key);
            entry = { status: 'ready', value };
            lazyStore.notify();
        } catch {
            entry = { status: 'error', value: undefined };
            lazyStore.notify();
        }
    };

    const attachChannel = () => {
        if (channel || typeof BroadcastChannel === 'undefined') return;

        channel = new BroadcastChannel(channelName(dbName, storeName, key));
        channel.onmessage = () => void load();
    };

    const detachChannel = () => {
        channel?.close();
        channel = null;
    };

    const lazyStore = createLazyStore(
        () => {
            attachChannel();
            void load();
        },
        () => detachChannel()
    );

    const set = async (value: T) => {
        await idbSet(dbName, storeName, key, value);
        entry = { status: 'ready', value };
        lazyStore.notify();
        channel?.postMessage('changed');
    };

    const remove = async () => {
        await idbRemove(dbName, storeName, key);
        entry = { status: 'ready', value: undefined };
        lazyStore.notify();
        channel?.postMessage('changed');
    };

    return {
        getSnapshot: () => entry,
        subscribe: lazyStore.subscribe,
        set,
        remove,
    };
}

const dbCache = createKeyedCache((dbName: string) =>
    createKeyedCache((storeName: string) =>
        createKeyedCache((key: string) => createStore<unknown>(dbName, storeName, key))
    )
);

export function getIndexedDBStore<T>(
    dbName: string,
    storeName: string,
    key: string
): IndexedDBStore<T> {
    return dbCache.get(dbName).get(storeName).get(key) as IndexedDBStore<T>;
}

export function resetIndexedDBStoresForTests(): void {
    dbCache.reset();
}

import { publishStoreChange, subscribeToStoreChanges } from './changes';
import { idbGet, idbRemove, idbSet, idbSupported } from './db';
import { createDisposeScheduler } from '../internal/disposeWhenUnused';
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

function createStore<T>(
    dbName: string,
    storeName: string,
    key: string,
    onDisposable: (store: IndexedDBStore<T>) => void
): IndexedDBStore<T> {
    let entry: IndexedDBEntry<T> = { status: 'loading', value: undefined };
    let unsubscribeFromChanges: (() => void) | null = null;
    let inFlight = 0;
    let seq = 0;

    const load = async () => {
        const ticket = ++seq;

        if (!idbSupported()) {
            entry = { status: 'unsupported', value: undefined };
            lazyStore.notify();
            return;
        }

        try {
            const value = await idbGet<T>(dbName, storeName, key);

            if (ticket !== seq) return;

            entry = { status: 'ready', value };
            lazyStore.notify();
        } catch {
            if (ticket !== seq) return;

            entry = { status: 'error', value: undefined };
            lazyStore.notify();
        }
    };

    const onStoreChange = (changedKey: string | null) => {
        if (changedKey === null || changedKey === key) void load();
    };

    const listenForChanges = () => {
        unsubscribeFromChanges ??= subscribeToStoreChanges(dbName, storeName, onStoreChange);
    };

    const stopListeningForChanges = () => {
        unsubscribeFromChanges?.();
        unsubscribeFromChanges = null;
    };

    const write = async (op: () => Promise<void>, next: T | undefined) => {
        inFlight += 1;

        const ticket = ++seq;

        try {
            await op();

            if (ticket === seq) {
                entry = { status: 'ready', value: next };
                lazyStore.notify();
            }

            publishStoreChange(dbName, storeName, key, onStoreChange);
        } catch (err) {
            if (ticket === seq) {
                entry = { status: 'error', value: entry.value };
                lazyStore.notify();
            }

            throw err;
        } finally {
            inFlight -= 1;
            scheduleDispose();
        }
    };

    const store: IndexedDBStore<T> = {
        getSnapshot: () => entry,
        subscribe: listener => lazyStore.subscribe(listener),
        set: value => write(() => idbSet(dbName, storeName, key, value), value),
        remove: () => write(() => idbRemove(dbName, storeName, key), undefined),
    };

    const scheduleDispose = createDisposeScheduler(
        () => lazyStore.size === 0 && inFlight === 0,
        () => onDisposable(store)
    );

    const lazyStore = createLazyStore(
        () => {
            listenForChanges();
            void load();
        },
        () => {
            stopListeningForChanges();
            scheduleDispose();
        }
    );

    return store;
}

const dbCache = createKeyedCache((dbName: string) =>
    createKeyedCache((storeName: string) => {
        const keys = createKeyedCache((key: string) =>
            createStore<unknown>(dbName, storeName, key, store => {
                if (keys.peek(key) === store) keys.delete(key);
            })
        );

        return keys;
    })
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

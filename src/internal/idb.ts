import { createAsyncQueue } from './createAsyncQueue';
import type { AsyncQueue } from './createAsyncQueue';
import { createKeyedCache } from './keyedCache';

interface DbState {
    db: IDBDatabase | null;
    queue: AsyncQueue;
}

const dbStates = createKeyedCache<string, DbState>(() => ({
    db: null,
    queue: createAsyncQueue(),
}));

export function idbSupported(): boolean {
    return typeof indexedDB !== 'undefined';
}

function openAtVersion(
    dbName: string,
    version: number | undefined,
    storeName: string
): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req =
            version === undefined ? indexedDB.open(dbName) : indexedDB.open(dbName, version);

        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(storeName)) {
                req.result.createObjectStore(storeName);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
        req.onblocked = () =>
            reject(
                new Error(`indexedDB upgrade of "${dbName}" blocked by another open tab/connection`)
            );
    });
}

function ensureStore(dbName: string, storeName: string): Promise<IDBDatabase> {
    const state = dbStates.get(dbName);

    return state.queue.enqueue(async () => {
        if (state.db && state.db.objectStoreNames.contains(storeName)) {
            return state.db;
        }

        state.db?.close();

        const nextVersion = state.db ? state.db.version + 1 : undefined;
        const db = await openAtVersion(dbName, nextVersion, storeName);

        db.onversionchange = () => {
            db.close();
            if (state.db === db) state.db = null;
        };

        state.db = db;

        return db;
    });
}

export async function idbGet<T>(
    dbName: string,
    storeName: string,
    key: string
): Promise<T | undefined> {
    const db = await ensureStore(dbName, storeName);

    return new Promise((resolve, reject) => {
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);

        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error ?? new Error('indexedDB get failed'));
    });
}

export async function idbSet(
    dbName: string,
    storeName: string,
    key: string,
    value: unknown
): Promise<void> {
    const db = await ensureStore(dbName, storeName);

    return new Promise((resolve, reject) => {
        const t = db.transaction(storeName, 'readwrite');

        t.objectStore(storeName).put(value, key);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error ?? new Error('indexedDB put failed'));
        t.onabort = () => reject(t.error ?? new Error('indexedDB transaction aborted'));
    });
}

export async function idbRemove(dbName: string, storeName: string, key: string): Promise<void> {
    const db = await ensureStore(dbName, storeName);

    return new Promise((resolve, reject) => {
        const t = db.transaction(storeName, 'readwrite');

        t.objectStore(storeName).delete(key);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error ?? new Error('indexedDB delete failed'));
        t.onabort = () => reject(t.error ?? new Error('indexedDB transaction aborted'));
    });
}

export async function idbSweep(
    dbName: string,
    storeName: string,
    shouldDelete: (value: unknown) => boolean
): Promise<void> {
    const db = await ensureStore(dbName, storeName);

    return new Promise((resolve, reject) => {
        const t = db.transaction(storeName, 'readwrite');
        const req = t.objectStore(storeName).openCursor();

        req.onsuccess = () => {
            const cursor = req.result;

            if (!cursor) return;
            if (shouldDelete(cursor.value)) cursor.delete();

            cursor.continue();
        };
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error ?? new Error('indexedDB sweep failed'));
        t.onabort = () => reject(t.error ?? new Error('indexedDB transaction aborted'));
    });
}

export function resetIdbConnectionsForTests(): void {
    dbStates.reset();
}

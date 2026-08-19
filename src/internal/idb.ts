import { createAsyncQueue } from './createAsyncQueue';
import type { AsyncQueue } from './createAsyncQueue';
import { createKeyedCache } from './keyedCache';

interface DbState {
    db: IDBDatabase | null;
    queue: AsyncQueue;
}

export interface IdbIndexDefinition {
    keyPath: string | string[];
    unique?: boolean;
    multiEntry?: boolean;
}

export type IdbIndexes = Record<string, string | string[] | IdbIndexDefinition>;

export interface IdbStoreRef {
    dbName: string;
    storeName: string;
    indexes?: IdbIndexes;
}

export interface IdbRecord<T> {
    key: IDBValidKey;
    value: T;
}

export interface IdbQueryOptions {
    index?: string;
    range?: IDBKeyRange | IDBValidKey | null;
    direction?: IDBCursorDirection;
    limit?: number;
    offset?: number;
}

interface NormalizedIndex {
    name: string;
    keyPath: string | string[];
    unique: boolean;
    multiEntry: boolean;
}

const dbStates = createKeyedCache<string, DbState>(() => ({
    db: null,
    queue: createAsyncQueue(),
}));

export function idbSupported(): boolean {
    return typeof indexedDB !== 'undefined';
}

function normalizeIndexes(indexes: IdbIndexes | undefined): NormalizedIndex[] {
    if (!indexes) return [];

    return Object.entries(indexes).map(([name, definition]) => {
        if (typeof definition === 'string' || Array.isArray(definition)) {
            return { name, keyPath: definition, unique: false, multiEntry: false };
        }

        return {
            name,
            keyPath: definition.keyPath,
            unique: definition.unique ?? false,
            multiEntry: definition.multiEntry ?? false,
        };
    });
}

function applySchema(
    db: IDBDatabase,
    transaction: IDBTransaction | null,
    storeName: string,
    indexes: NormalizedIndex[]
): void {
    const store = db.objectStoreNames.contains(storeName)
        ? transaction?.objectStore(storeName)
        : db.createObjectStore(storeName);

    if (!store) return;

    for (const index of indexes) {
        if (store.indexNames.contains(index.name)) continue;

        store.createIndex(index.name, index.keyPath, {
            unique: index.unique,
            multiEntry: index.multiEntry,
        });
    }
}

function openAtVersion(
    dbName: string,
    version: number | undefined,
    storeName: string,
    indexes: NormalizedIndex[]
): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req =
            version === undefined ? indexedDB.open(dbName) : indexedDB.open(dbName, version);

        let settled = false;

        req.onupgradeneeded = () => applySchema(req.result, req.transaction, storeName, indexes);

        req.onsuccess = () => {
            if (settled) {
                req.result.close();

                return;
            }

            settled = true;
            resolve(req.result);
        };

        req.onerror = () => {
            if (settled) return;

            settled = true;
            reject(req.error ?? new Error('indexedDB open failed'));
        };

        req.onblocked = () => {
            if (settled) return;

            settled = true;
            reject(
                new Error(`indexedDB upgrade of "${dbName}" blocked by another open tab/connection`)
            );
        };
    });
}

function satisfiesSchema(db: IDBDatabase, storeName: string, indexes: NormalizedIndex[]): boolean {
    if (!db.objectStoreNames.contains(storeName)) return false;
    if (indexes.length === 0) return true;

    try {
        const store = db.transaction(storeName, 'readonly').objectStore(storeName);

        return indexes.every(index => store.indexNames.contains(index.name));
    } catch {
        return false;
    }
}

function ensureStore(
    dbName: string,
    storeName: string,
    indexes?: IdbIndexes
): Promise<IDBDatabase> {
    const state = dbStates.get(dbName);
    const wanted = normalizeIndexes(indexes);

    return state.queue.enqueue(async () => {
        if (state.db && satisfiesSchema(state.db, storeName, wanted)) {
            return state.db;
        }

        const previous = state.db;

        state.db = null;
        previous?.close();

        const nextVersion = previous ? previous.version + 1 : undefined;
        let db = await openAtVersion(dbName, nextVersion, storeName, wanted);

        if (!satisfiesSchema(db, storeName, wanted)) {
            const upgradeVersion = db.version + 1;

            db.close();
            db = await openAtVersion(dbName, upgradeVersion, storeName, wanted);
        }

        db.onversionchange = () => {
            db.close();
            if (state.db === db) state.db = null;
        };

        state.db = db;

        return db;
    });
}

function runTransaction<T>(
    db: IDBDatabase,
    storeName: string,
    mode: IDBTransactionMode,
    label: string,
    run: (store: IDBObjectStore) => () => T
): Promise<T> {
    return new Promise((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        let readResult: () => T;

        try {
            readResult = run(t.objectStore(storeName));
        } catch (error) {
            reject(error);
            t.abort();

            return;
        }

        t.oncomplete = () => resolve(readResult());
        t.onerror = () => reject(t.error ?? new Error(`indexedDB ${label} failed`));
        t.onabort = () => reject(t.error ?? new Error('indexedDB transaction aborted'));
    });
}

function cursorSource(store: IDBObjectStore, index: string | undefined): IDBObjectStore | IDBIndex {
    return index === undefined ? store : store.index(index);
}

function cursorQuery(
    range: IDBKeyRange | IDBValidKey | null | undefined
): IDBKeyRange | IDBValidKey | undefined {
    return range === null ? undefined : range;
}

function walk<T>(
    store: IDBObjectStore,
    options: IdbQueryOptions,
    visit: (record: IdbRecord<T>) => boolean
): void {
    const { index, range, direction, limit } = options;

    if (limit !== undefined && limit <= 0) return;

    const offset = Math.max(0, Math.floor(options.offset ?? 0));
    const req = cursorSource(store, index).openCursor(cursorQuery(range), direction);
    let skipped = offset === 0;
    let seen = 0;

    req.onsuccess = () => {
        const cursor = req.result;

        if (!cursor) return;

        if (!skipped) {
            skipped = true;
            cursor.advance(offset);

            return;
        }

        if (!visit({ key: cursor.primaryKey, value: cursor.value as T })) return;

        seen += 1;

        if (limit !== undefined && seen >= limit) return;

        cursor.continue();
    };
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

export async function idbGetMany<T>(
    ref: IdbStoreRef,
    keys: readonly string[]
): Promise<(T | undefined)[]> {
    const db = await ensureStore(ref.dbName, ref.storeName, ref.indexes);

    return runTransaction(db, ref.storeName, 'readonly', 'getMany', store => {
        const requests = keys.map(key => store.get(key));

        return () => requests.map(req => req.result as T | undefined);
    });
}

export async function idbSetMany<T>(
    ref: IdbStoreRef,
    records: readonly IdbRecord<T>[]
): Promise<void> {
    const db = await ensureStore(ref.dbName, ref.storeName, ref.indexes);

    return runTransaction(db, ref.storeName, 'readwrite', 'setMany', store => {
        for (const record of records) store.put(record.value, record.key);

        return () => undefined;
    });
}

export async function idbRemoveMany(ref: IdbStoreRef, keys: readonly string[]): Promise<void> {
    const db = await ensureStore(ref.dbName, ref.storeName, ref.indexes);

    return runTransaction(db, ref.storeName, 'readwrite', 'removeMany', store => {
        for (const key of keys) store.delete(key);

        return () => undefined;
    });
}

export async function idbClear(ref: IdbStoreRef): Promise<void> {
    const db = await ensureStore(ref.dbName, ref.storeName, ref.indexes);

    return runTransaction(db, ref.storeName, 'readwrite', 'clear', store => {
        store.clear();

        return () => undefined;
    });
}

export async function idbCount(
    ref: IdbStoreRef,
    options: Pick<IdbQueryOptions, 'index' | 'range'> = {}
): Promise<number> {
    const db = await ensureStore(ref.dbName, ref.storeName, ref.indexes);

    return runTransaction(db, ref.storeName, 'readonly', 'count', store => {
        const req = cursorSource(store, options.index).count(cursorQuery(options.range));

        return () => req.result;
    });
}

export async function idbQuery<T>(
    ref: IdbStoreRef,
    options: IdbQueryOptions = {}
): Promise<IdbRecord<T>[]> {
    const db = await ensureStore(ref.dbName, ref.storeName, ref.indexes);

    return runTransaction(db, ref.storeName, 'readonly', 'query', store => {
        const records: IdbRecord<T>[] = [];

        walk<T>(store, options, record => {
            records.push(record);

            return true;
        });

        return () => records;
    });
}

export async function idbIterate<T>(
    ref: IdbStoreRef,
    options: IdbQueryOptions,
    visit: (record: IdbRecord<T>) => boolean | void
): Promise<void> {
    const db = await ensureStore(ref.dbName, ref.storeName, ref.indexes);

    return runTransaction(db, ref.storeName, 'readonly', 'iterate', store => {
        walk<T>(store, options, record => visit(record) !== false);

        return () => undefined;
    });
}

export function resetIdbConnectionsForTests(): void {
    dbStates.reset();
}

const DB_NAME = 'react-kithooks:drafts';
const STORE = 'drafts';

let dbPromise: Promise<IDBDatabase> | null = null;

export function idbSupported(): boolean {
    return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);

        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => {
            const db = req.result;

            db.onversionchange = () => {
                db.close();
                dbPromise = null;
            };

            resolve(db);
        };
        req.onerror = () => {
            dbPromise = null;
            reject(req.error ?? new Error('indexedDB open failed'));
        };
    });

    return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);

        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error ?? new Error('indexedDB get failed'));
    });
}

export async function idbPut(key: string, value: unknown): Promise<void> {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite');

        t.objectStore(STORE).put(value, key);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error ?? new Error('indexedDB put failed'));
        t.onabort = () => reject(t.error ?? new Error('indexedDB transaction aborted'));
    });
}

export async function idbDelete(key: string): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).delete(key);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error ?? new Error('indexedDB delete failed'));
    });
}

/** Opportunistic housekeeping: drop every record past its own recorded TTL. */
export async function idbSweepExpired(now: number): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite');
        const req = t.objectStore(STORE).openCursor();
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return;
            const rec = cursor.value as { savedAt?: unknown; ttlMs?: unknown } | undefined;
            if (
                rec &&
                typeof rec.savedAt === 'number' &&
                typeof rec.ttlMs === 'number' &&
                rec.savedAt + rec.ttlMs < now
            ) {
                cursor.delete();
            }
            cursor.continue();
        };
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error ?? new Error('indexedDB sweep failed'));
    });
}

export function resetIdbCacheForTests(): void {
    dbPromise = null;
}

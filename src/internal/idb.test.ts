import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

import {
    idbCount,
    idbGet,
    idbGetMany,
    idbIterate,
    idbQuery,
    idbSet,
    idbSetMany,
    idbSweep,
    resetIdbConnectionsForTests,
} from './idb';

const DB_NAME = 'react-kithooks:idb-test';

function openBlockingConnection(version: number, storeName: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, version);

        req.onupgradeneeded = () => req.result.createObjectStore(storeName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('open failed'));
    });
}

async function settleOpenRequests(): Promise<void> {
    for (let i = 0; i < 3; i += 1) await new Promise(resolve => setTimeout(resolve, 0));
}

describe('openAtVersion', () => {
    beforeEach(() => {
        (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
        resetIdbConnectionsForTests();
    });

    afterEach(() => {
        resetIdbConnectionsForTests();
    });

    it('closes the connection a blocked upgrade opens after the blocker goes away', async () => {
        const blocker = await openBlockingConnection(1, 'existing');

        await expect(idbSet(DB_NAME, 'added', 'k', 1)).rejects.toThrow(/blocked/);

        blocker.close();
        await settleOpenRequests();

        await expect(idbSet(DB_NAME, 'another', 'k', 2)).resolves.toBeUndefined();
    });

    it('does not keep a closed connection cached after an upgrade fails', async () => {
        await expect(idbSet(DB_NAME, 'store-a', 'k', 1)).resolves.toBeUndefined();

        const blocker = await openBlockingConnection(1, 'store-a');

        await expect(idbSet(DB_NAME, 'store-b', 'k', 1)).rejects.toThrow(/blocked/);

        blocker.close();
        await settleOpenRequests();
        await expect(idbSet(DB_NAME, 'store-a', 'k', 2)).resolves.toBeUndefined();
    });
});

describe('idbGet', () => {
    afterEach(() => {
        resetIdbConnectionsForTests();
    });

    it('rejects when the transaction aborts instead of hanging forever', async () => {
        const transaction = {
            objectStore: () => ({ get: () => ({ result: undefined }) }),
            error: null,
            onabort: null as (() => void) | null,
            oncomplete: null,
            onerror: null,
            abort: () => undefined,
        };
        const db = {
            version: 1,
            objectStoreNames: { contains: () => true },
            transaction: () => {
                setTimeout(() => transaction.onabort?.(), 0);

                return transaction;
            },
            close: () => undefined,
            onversionchange: null,
        };

        (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
            open: () => {
                const req: Record<string, unknown> = { result: db, error: null };

                setTimeout(() => (req.onsuccess as (() => void) | undefined)?.(), 0);

                return req;
            },
        };

        await expect(idbGet(DB_NAME, 'store', 'k')).rejects.toThrow(/aborted/);
    });

    it('rejects when the transaction fires onerror', async () => {
        const transaction = {
            objectStore: () => ({ get: () => ({ result: undefined }) }),
            error: new Error('boom'),
            onabort: null as (() => void) | null,
            oncomplete: null,
            onerror: null as (() => void) | null,
            abort: () => undefined,
        };
        const db = {
            version: 1,
            objectStoreNames: { contains: () => true },
            transaction: () => {
                setTimeout(() => transaction.onerror?.(), 0);

                return transaction;
            },
            close: () => undefined,
            onversionchange: null,
        };

        (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
            open: () => {
                const req: Record<string, unknown> = { result: db, error: null };

                setTimeout(() => (req.onsuccess as (() => void) | undefined)?.(), 0);

                return req;
            },
        };

        await expect(idbGet(DB_NAME, 'store', 'k')).rejects.toThrow('boom');
    });

    it('falls back to a generic error when the transaction fires onerror with no error set', async () => {
        const transaction = {
            objectStore: () => ({ get: () => ({ result: undefined }) }),
            error: null as Error | null,
            onabort: null as (() => void) | null,
            oncomplete: null,
            onerror: null as (() => void) | null,
            abort: () => undefined,
        };
        const db = {
            version: 1,
            objectStoreNames: { contains: () => true },
            transaction: () => {
                setTimeout(() => transaction.onerror?.(), 0);

                return transaction;
            },
            close: () => undefined,
            onversionchange: null,
        };

        (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
            open: () => {
                const req: Record<string, unknown> = { result: db, error: null };

                setTimeout(() => (req.onsuccess as (() => void) | undefined)?.(), 0);

                return req;
            },
        };

        await expect(idbGet(DB_NAME, 'store', 'k')).rejects.toThrow(/get failed/);
    });
});

describe('normalizeIndexes (via ensureStore schema application)', () => {
    beforeEach(() => {
        (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
        resetIdbConnectionsForTests();
    });

    afterEach(() => {
        resetIdbConnectionsForTests();
    });

    it('normalizes string, array, and object index definitions with their defaults', async () => {
        const ref = {
            dbName: 'react-kithooks:idb-normalize',
            storeName: 'items',
            indexes: {
                byTag: ['tag'],
                byAuthorFull: { keyPath: 'author', unique: true, multiEntry: true },
                byDate: { keyPath: 'date' },
            },
        };

        await idbSetMany(ref, [{ key: 'k1', value: { tag: ['a', 'b'], author: 'x', date: 1 } }]);

        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open(ref.dbName);

            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        const store = db.transaction('items', 'readonly').objectStore('items');

        expect(store.indexNames.contains('byTag')).toBe(true);
        expect(store.indexNames.contains('byAuthorFull')).toBe(true);
        expect(store.indexNames.contains('byDate')).toBe(true);
        expect(store.index('byAuthorFull').unique).toBe(true);
        expect(store.index('byAuthorFull').multiEntry).toBe(true);
        expect(store.index('byDate').unique).toBe(false);
        expect(store.index('byDate').multiEntry).toBe(false);

        db.close();

        const found = await idbGetMany<{ tag: string[] }>(ref, ['k1']);

        expect(found[0]?.tag).toEqual(['a', 'b']);
    });
});

describe('applySchema', () => {
    beforeEach(() => {
        (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
        resetIdbConnectionsForTests();
    });

    afterEach(() => {
        resetIdbConnectionsForTests();
    });

    it('skips an index that already exists and only creates the new one', async () => {
        const dbName = 'react-kithooks:idb-schema-upgrade';
        const ref1 = { dbName, storeName: 'items', indexes: { byA: 'a' } };

        await idbSetMany(ref1, [{ key: 'k1', value: { a: 1, b: 2 } }]);

        const ref2 = { dbName, storeName: 'items', indexes: { byA: 'a', byB: 'b' } };

        await idbSetMany(ref2, [{ key: 'k2', value: { a: 3, b: 4 } }]);

        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const req = indexedDB.open(dbName);

            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });

        const store = db.transaction('items', 'readonly').objectStore('items');

        expect(store.indexNames.contains('byA')).toBe(true);
        expect(store.indexNames.contains('byB')).toBe(true);
        db.close();
    });

    it('does nothing when the object store lookup during upgrade is unavailable', async () => {
        const db = {
            objectStoreNames: { contains: () => true },
            createObjectStore: () => {
                throw new Error('should not create when store already exists');
            },
            transaction: () => {
                const t = {
                    objectStore: () => ({ put: () => undefined }),
                    oncomplete: null as (() => void) | null,
                    onerror: null,
                    onabort: null,
                    error: null,
                };

                setTimeout(() => t.oncomplete?.(), 0);

                return t;
            },
            onversionchange: null,
            version: 1,
            close: () => undefined,
        };

        (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
            open: () => {
                const req: Record<string, unknown> = { result: db, error: null, transaction: null };

                setTimeout(() => {
                    (req.onupgradeneeded as (() => void) | undefined)?.();
                    (req.onsuccess as (() => void) | undefined)?.();
                }, 0);

                return req;
            },
        };

        await expect(
            idbSet('react-kithooks:idb-noop-schema', 'items', 'k', 1)
        ).resolves.toBeUndefined();
    });
});

describe('openAtVersion errors', () => {
    beforeEach(() => {
        (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
        resetIdbConnectionsForTests();
    });

    afterEach(() => {
        resetIdbConnectionsForTests();
    });

    it('surfaces a real engine error (invalid index keyPath aborts the upgrade)', async () => {
        const dbName = 'react-kithooks:idb-invalid-index';

        await expect(
            idbSetMany({ dbName, storeName: 'items', indexes: { bad: '1abc' } }, [
                { key: 'k', value: 1 },
            ])
        ).rejects.toThrow();
    });

    it('rejects when open fires onerror with no error object set', async () => {
        (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
            open: () => {
                const req: Record<string, unknown> = { error: null };

                setTimeout(() => (req.onerror as (() => void) | undefined)?.(), 0);

                return req;
            },
        };

        await expect(idbSet('react-kithooks:idb-open-error', 'items', 'k', 1)).rejects.toThrow(
            /indexedDB open failed/
        );
    });

    it('ignores a late onerror after the request already succeeded', async () => {
        let onsuccess: (() => void) | undefined;
        let onerror: (() => void) | undefined;
        const db = {
            objectStoreNames: { contains: () => true },
            transaction: () => {
                const t = {
                    objectStore: () => ({ put: () => undefined }),
                    oncomplete: null as (() => void) | null,
                    onerror: null,
                    onabort: null,
                    error: null,
                };

                setTimeout(() => t.oncomplete?.(), 0);

                return t;
            },
            onversionchange: null,
            version: 1,
            close: () => undefined,
        };

        (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
            open: () => {
                const req: Record<string, unknown> = { result: db, error: null };

                Object.defineProperty(req, 'onsuccess', {
                    set(fn: () => void) {
                        onsuccess = fn;
                    },
                });
                Object.defineProperty(req, 'onerror', {
                    set(fn: () => void) {
                        onerror = fn;
                    },
                });

                setTimeout(() => {
                    onsuccess?.();
                    onerror?.();
                }, 0);

                return req;
            },
        };

        await expect(
            idbSet('react-kithooks:idb-late-error', 'items', 'k', 1)
        ).resolves.toBeUndefined();
    });
});

describe('cursorQuery / walk', () => {
    beforeEach(() => {
        (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
        resetIdbConnectionsForTests();
    });

    afterEach(() => {
        resetIdbConnectionsForTests();
    });

    const ref = { dbName: 'react-kithooks:idb-walk', storeName: 'items' };

    it('treats an explicit null range the same as no range', async () => {
        await idbSetMany(ref, [
            { key: 'a', value: 1 },
            { key: 'b', value: 2 },
        ]);

        const rows = await idbQuery<number>(ref, { range: null });

        expect(rows).toHaveLength(2);

        const count = await idbCount(ref, { range: null });

        expect(count).toBe(2);
    });

    it('returns immediately without opening a cursor when limit is 0', async () => {
        await idbSetMany(ref, [{ key: 'a', value: 1 }]);

        const rows = await idbQuery<number>(ref, { limit: 0 });

        expect(rows).toEqual([]);

        const visited: number[] = [];

        await idbIterate<number>(ref, { limit: -1 }, record => {
            visited.push(record.value);

            return true;
        });

        expect(visited).toEqual([]);
    });
});

describe('idbSweep', () => {
    beforeEach(() => {
        (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
        resetIdbConnectionsForTests();
    });

    afterEach(() => {
        resetIdbConnectionsForTests();
    });

    const ref = { dbName: 'react-kithooks:idb-sweep', storeName: 'items' };

    it('deletes only the records matching the predicate', async () => {
        await idbSetMany(ref, [
            { key: 'keep', value: { expired: false } },
            { key: 'gone-1', value: { expired: true } },
            { key: 'gone-2', value: { expired: true } },
        ]);

        await idbSweep(ref.dbName, ref.storeName, value => (value as { expired: boolean }).expired);

        const rows = await idbQuery<{ expired: boolean }>(ref);
        const keys = rows.map(r => r.key);

        expect(keys).toEqual(['keep']);
    });

    it('rejects when the sweep transaction fires onerror', async () => {
        let onsuccess: (() => void) | undefined;
        const cursorReq: Record<string, unknown> = {};

        Object.defineProperty(cursorReq, 'onsuccess', {
            set(fn: () => void) {
                onsuccess = fn;
            },
        });
        void onsuccess;

        const t = {
            objectStore: () => ({ openCursor: () => cursorReq }),
            error: new Error('sweep boom'),
            oncomplete: null,
            onabort: null as (() => void) | null,
            onerror: null as (() => void) | null,
        };
        const db = {
            objectStoreNames: { contains: () => true },
            transaction: () => {
                setTimeout(() => t.onerror?.(), 0);

                return t;
            },
            onversionchange: null,
            version: 1,
            close: () => undefined,
        };

        (globalThis as unknown as { indexedDB: unknown }).indexedDB = {
            open: () => {
                const req: Record<string, unknown> = { result: db, error: null };

                setTimeout(() => (req.onsuccess as (() => void) | undefined)?.(), 0);

                return req;
            },
        };

        await expect(
            idbSweep('react-kithooks:idb-sweep-error', 'items', () => false)
        ).rejects.toThrow('sweep boom');
    });
});

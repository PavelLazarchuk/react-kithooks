import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

import { idbSet, resetIdbConnectionsForTests } from './idb';

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

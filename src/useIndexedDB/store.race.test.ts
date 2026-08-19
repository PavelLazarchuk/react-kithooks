import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
}

const pendingGets: Deferred<unknown>[] = [];
const pendingSets: Deferred<void>[] = [];

vi.mock('./db', () => ({
    idbSupported: () => true,
    idbGet: () => {
        const d = deferred<unknown>();
        pendingGets.push(d);

        return d.promise;
    },
    idbSet: () => {
        const d = deferred<void>();
        pendingSets.push(d);

        return d.promise;
    },
    idbRemove: () => {
        const d = deferred<void>();
        pendingSets.push(d);

        return d.promise;
    },
}));

const { getIndexedDBStore, resetIndexedDBStoresForTests } = await import('./store');
const { publishStoreChange, resetStoreChangesForTests } = await import('./changes');

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('useIndexedDB store — settlement ordering', () => {
    beforeEach(() => {
        pendingGets.length = 0;
        pendingSets.length = 0;
        resetIndexedDBStoresForTests();
        resetStoreChangesForTests();
    });

    afterEach(() => {
        resetIndexedDBStoresForTests();
        resetStoreChangesForTests();
    });

    it('does not let a read started before a write publish its stale value afterwards', async () => {
        const store = getIndexedDBStore<string>('db', 'store', 'k');
        const unsubscribe = store.subscribe(() => undefined);

        await flush();
        pendingGets[0]!.resolve('old');
        await flush();
        expect(store.getSnapshot()).toEqual({ status: 'ready', value: 'old' });

        publishStoreChange('db', 'store', 'k');
        await flush();
        expect(pendingGets).toHaveLength(2);

        const written = store.set('new');
        await flush();
        pendingSets[0]!.resolve();
        await written;
        expect(store.getSnapshot()).toEqual({ status: 'ready', value: 'new' });

        pendingGets[1]!.resolve('old');
        await flush();

        expect(store.getSnapshot()).toEqual({ status: 'ready', value: 'new' });

        unsubscribe();
    });

    it('keeps the newest of two overlapping reads', async () => {
        const store = getIndexedDBStore<string>('db', 'store', 'k');
        const unsubscribe = store.subscribe(() => undefined);

        await flush();
        pendingGets[0]!.resolve('first');
        await flush();

        publishStoreChange('db', 'store', 'k');
        publishStoreChange('db', 'store', 'k');
        await flush();
        expect(pendingGets).toHaveLength(3);

        pendingGets[2]!.resolve('newest');
        await flush();
        pendingGets[1]!.resolve('stale');
        await flush();

        expect(store.getSnapshot()).toEqual({ status: 'ready', value: 'newest' });

        unsubscribe();
    });

    it('does not let a superseded failed read overwrite a good value with an error', async () => {
        const store = getIndexedDBStore<string>('db', 'store', 'k');
        const unsubscribe = store.subscribe(() => undefined);

        await flush();
        pendingGets[0]!.resolve('value');
        await flush();

        publishStoreChange('db', 'store', 'k');
        await flush();

        const written = store.set('newer');
        await flush();
        pendingSets[0]!.resolve();
        await written;

        pendingGets[1]!.reject(new Error('read blew up'));
        await flush();

        expect(store.getSnapshot()).toEqual({ status: 'ready', value: 'newer' });

        unsubscribe();
    });
});

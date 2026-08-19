import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => {
        resolve = res;
    });

    return { promise, resolve };
}

const pendingQueries: Deferred<{ key: string; value: string }[]>[] = [];

vi.mock('../internal/idb', () => ({
    idbSupported: () => true,
    idbQuery: () => {
        const d = deferred<{ key: string; value: string }[]>();
        pendingQueries.push(d);

        return d.promise;
    },
    idbGetMany: () => Promise.resolve([]),
    idbSetMany: () => Promise.resolve(),
    idbRemoveMany: () => Promise.resolve(),
    idbClear: () => Promise.resolve(),
    idbCount: () => Promise.resolve(0),
    idbIterate: () => Promise.resolve(),
}));

const { useIndexedDBCollection } = await import('./index');
const { publishStoreChange, resetStoreChangesForTests } = await import('../useIndexedDB/changes');

describe('useIndexedDBCollection — settlement ordering', () => {
    beforeEach(() => {
        pendingQueries.length = 0;
        resetStoreChangesForTests();
    });

    afterEach(() => {
        resetStoreChangesForTests();
    });

    it('keeps the newest read when two overlapping reads settle out of order', async () => {
        const { result } = renderHook(() =>
            useIndexedDBCollection<string>({ dbName: 'db', storeName: 'store' })
        );

        await waitFor(() => expect(pendingQueries).toHaveLength(1));
        await act(async () => {
            pendingQueries[0]!.resolve([{ key: 'a', value: 'first' }]);
        });
        expect(result.current.items).toEqual(['first']);

        act(() => {
            publishStoreChange('db', 'store', null);
            publishStoreChange('db', 'store', null);
        });
        await waitFor(() => expect(pendingQueries).toHaveLength(3));

        await act(async () => {
            pendingQueries[2]!.resolve([{ key: 'a', value: 'newest' }]);
        });
        await act(async () => {
            pendingQueries[1]!.resolve([{ key: 'a', value: 'stale' }]);
        });

        expect(result.current.items).toEqual(['newest']);
        expect(result.current.status).toBe('ready');
    });
});

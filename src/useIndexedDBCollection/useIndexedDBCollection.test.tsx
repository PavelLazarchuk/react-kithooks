import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';

import { useIndexedDBCollection } from './index';
import type { IndexedDBRecord } from './index';
import { useIndexedDB } from '../useIndexedDB';
import { channelName, resetStoreChangesForTests } from '../useIndexedDB/changes';
import { DEFAULT_STORE_NAME, resetIndexedDBCacheForTests } from '../useIndexedDB/db';
import { resetIndexedDBStoresForTests } from '../useIndexedDB/store';

interface Note {
    title: string;
    author: string;
    createdAt: number;
}

function note(title: string, author: string, createdAt: number): Note {
    return { title, author, createdAt };
}

const seed: IndexedDBRecord<Note>[] = [
    { key: 'n1', value: note('first', 'ann', 3) },
    { key: 'n2', value: note('second', 'bob', 1) },
    { key: 'n3', value: note('third', 'ann', 2) },
];

function resetIdb() {
    (globalThis as any).indexedDB = new IDBFactory();
    (globalThis as any).IDBKeyRange = IDBKeyRange;
    resetIndexedDBCacheForTests();
    resetIndexedDBStoresForTests();
    resetStoreChangesForTests();
}

let dbCounter = 0;

function nextDb(): string {
    dbCounter += 1;

    return `collection-db-${dbCounter}`;
}

describe('useIndexedDBCollection', () => {
    beforeEach(() => {
        resetIdb();
    });

    afterEach(() => {
        resetIndexedDBCacheForTests();
        resetIndexedDBStoresForTests();
        resetStoreChangesForTests();
    });

    it('starts loading and resolves to an empty store', async () => {
        const dbName = nextDb();
        const { result } = renderHook(() => useIndexedDBCollection<Note>({ dbName }));

        expect(result.current.status).toBe('loading');
        expect(result.current.items).toEqual([]);

        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(result.current.records).toEqual([]);
    });

    it('setMany writes a batch and the view refreshes in key order', async () => {
        const dbName = nextDb();
        const { result } = renderHook(() => useIndexedDBCollection<Note>({ dbName }));
        await waitFor(() => expect(result.current.status).toBe('ready'));

        await act(async () => {
            await result.current.setMany(seed);
        });

        await waitFor(() => expect(result.current.items).toHaveLength(3));
        expect(result.current.records.map(record => record.key)).toEqual(['n1', 'n2', 'n3']);
        expect(result.current.items.map(item => item.title)).toEqual(['first', 'second', 'third']);
    });

    it('rolls the whole batch back when one record in it cannot be stored', async () => {
        const dbName = nextDb();
        const { result } = renderHook(() => useIndexedDBCollection<unknown>({ dbName }));
        await waitFor(() => expect(result.current.status).toBe('ready'));

        await act(async () => {
            await expect(
                result.current.setMany([
                    { key: 'ok', value: { title: 'fine' } },
                    { key: 'bad', value: { fn: () => undefined } },
                ])
            ).rejects.toBeTruthy();
        });

        await act(async () => {
            await expect(result.current.get('ok')).resolves.toBeUndefined();
        });
    });

    it('queries by index, narrowed by a range', async () => {
        const dbName = nextDb();
        const { result } = renderHook(() =>
            useIndexedDBCollection<Note>({
                dbName,
                indexes: { byAuthor: 'author' },
                index: 'byAuthor',
                range: IDBKeyRange.only('ann'),
            })
        );
        await waitFor(() => expect(result.current.status).toBe('ready'));

        await act(async () => {
            await result.current.setMany(seed);
        });

        await waitFor(() => expect(result.current.items).toHaveLength(2));
        expect(result.current.items.map(item => item.title).sort()).toEqual(['first', 'third']);
    });

    it('orders by an index and honours direction, limit and offset', async () => {
        const dbName = nextDb();
        const { result, rerender } = renderHook(
            (props: { direction?: IDBCursorDirection; limit?: number; offset?: number }) =>
                useIndexedDBCollection<Note>({
                    dbName,
                    indexes: { byDate: 'createdAt' },
                    index: 'byDate',
                    ...props,
                }),
            { initialProps: {} }
        );
        await waitFor(() => expect(result.current.status).toBe('ready'));

        await act(async () => {
            await result.current.setMany(seed);
        });
        await waitFor(() => expect(result.current.items).toHaveLength(3));
        expect(result.current.items.map(item => item.createdAt)).toEqual([1, 2, 3]);

        rerender({ direction: 'prev' });
        await waitFor(() =>
            expect(result.current.items.map(item => item.createdAt)).toEqual([3, 2, 1])
        );

        rerender({ limit: 2, offset: 1 });
        await waitFor(() =>
            expect(result.current.items.map(item => item.createdAt)).toEqual([2, 3])
        );
    });

    it('adds an index to a store that already exists, without losing its records', async () => {
        const dbName = nextDb();
        const plain = renderHook(() => useIndexedDBCollection<Note>({ dbName }));
        await waitFor(() => expect(plain.result.current.status).toBe('ready'));

        await act(async () => {
            await plain.result.current.setMany(seed);
        });
        await waitFor(() => expect(plain.result.current.items).toHaveLength(3));
        plain.unmount();

        const indexed = renderHook(() =>
            useIndexedDBCollection<Note>({
                dbName,
                indexes: { byAuthor: 'author' },
                index: 'byAuthor',
                range: IDBKeyRange.only('bob'),
            })
        );

        await waitFor(() => expect(indexed.result.current.status).toBe('ready'));
        await waitFor(() => expect(indexed.result.current.items).toHaveLength(1));
        expect(indexed.result.current.items[0]?.title).toBe('second');
    });

    it('removeMany drops a batch and clear empties the store', async () => {
        const dbName = nextDb();
        const { result } = renderHook(() => useIndexedDBCollection<Note>({ dbName }));
        await waitFor(() => expect(result.current.status).toBe('ready'));

        await act(async () => {
            await result.current.setMany(seed);
        });
        await waitFor(() => expect(result.current.items).toHaveLength(3));

        await act(async () => {
            await result.current.removeMany(['n1', 'n2']);
        });
        await waitFor(() => expect(result.current.records.map(r => r.key)).toEqual(['n3']));

        await act(async () => {
            await result.current.clear();
        });
        await waitFor(() => expect(result.current.items).toEqual([]));
    });

    it('getMany reads a batch of keys in the order asked for', async () => {
        const dbName = nextDb();
        const { result } = renderHook(() => useIndexedDBCollection<Note>({ dbName }));
        await waitFor(() => expect(result.current.status).toBe('ready'));

        await act(async () => {
            await result.current.setMany(seed);
        });

        await act(async () => {
            const values = await result.current.getMany(['n3', 'missing', 'n1']);

            expect(values.map(value => value?.title)).toEqual(['third', undefined, 'first']);
        });
    });

    it('counts without reading values, and counts a range on an index', async () => {
        const dbName = nextDb();
        const { result } = renderHook(() =>
            useIndexedDBCollection<Note>({ dbName, indexes: { byAuthor: 'author' } })
        );
        await waitFor(() => expect(result.current.status).toBe('ready'));

        await act(async () => {
            await result.current.setMany(seed);
        });

        await act(async () => {
            await expect(result.current.count()).resolves.toBe(3);
            await expect(
                result.current.count({ index: 'byAuthor', range: IDBKeyRange.only('ann') })
            ).resolves.toBe(2);
        });
    });

    it('iterate walks every record and stops early when the visitor returns false', async () => {
        const dbName = nextDb();
        const { result } = renderHook(() => useIndexedDBCollection<Note>({ dbName }));
        await waitFor(() => expect(result.current.status).toBe('ready'));

        await act(async () => {
            await result.current.setMany(seed);
        });

        const seen: string[] = [];

        await act(async () => {
            await result.current.iterate(record => {
                seen.push(record.key as string);
            });
        });
        expect(seen).toEqual(['n1', 'n2', 'n3']);

        const stopped: string[] = [];

        await act(async () => {
            await result.current.iterate(record => {
                stopped.push(record.key as string);

                return stopped.length < 2;
            });
        });
        expect(stopped).toEqual(['n1', 'n2']);
    });

    it('refreshes when a useIndexedDB on the same store writes a key', async () => {
        const dbName = nextDb();
        const collection = renderHook(() => useIndexedDBCollection<number>({ dbName }));
        await waitFor(() => expect(collection.result.current.status).toBe('ready'));

        const single = renderHook(() => useIndexedDB<number>('count', 0, { dbName }));
        await waitFor(() => expect(single.result.current[3]).toBe('ready'));

        await act(async () => {
            await single.result.current[1](7);
        });

        await waitFor(() => expect(collection.result.current.items).toEqual([7]));
    });

    it('pushes its own writes into a useIndexedDB reading the same key', async () => {
        const dbName = nextDb();
        const single = renderHook(() => useIndexedDB<number>('count', 0, { dbName }));
        await waitFor(() => expect(single.result.current[3]).toBe('ready'));

        const collection = renderHook(() => useIndexedDBCollection<number>({ dbName }));
        await waitFor(() => expect(collection.result.current.status).toBe('ready'));

        await act(async () => {
            await collection.result.current.set('count', 9);
        });

        await waitFor(() => expect(single.result.current[0]).toBe(9));
    });

    it('reacts to a foreign-tab write broadcast over BroadcastChannel', async () => {
        const dbName = nextDb();
        const { result } = renderHook(() => useIndexedDBCollection<Note>({ dbName }));
        await waitFor(() => expect(result.current.status).toBe('ready'));

        const { idbSetMany } = await import('../internal/idb');
        await idbSetMany({ dbName, storeName: DEFAULT_STORE_NAME }, seed);

        const foreign = new BroadcastChannel(channelName(dbName, DEFAULT_STORE_NAME));
        foreign.postMessage({ key: null });

        await waitFor(() => expect(result.current.items).toHaveLength(3));
        foreign.close();
    });

    it('stops listening once it unmounts', async () => {
        const dbName = nextDb();
        const { result, unmount } = renderHook(() => useIndexedDBCollection<Note>({ dbName }));
        await waitFor(() => expect(result.current.status).toBe('ready'));
        unmount();

        const foreign = new BroadcastChannel(channelName(dbName, DEFAULT_STORE_NAME));
        expect(() => foreign.postMessage({ key: null })).not.toThrow();
        foreign.close();
    });

    it('reports unsupported when indexedDB is missing and never throws', async () => {
        const dbName = nextDb();
        delete (globalThis as any).indexedDB;
        const { result } = renderHook(() => useIndexedDBCollection<Note>({ dbName }));

        await waitFor(() => expect(result.current.status).toBe('unsupported'));
        expect(result.current.items).toEqual([]);
    });

    it('reports a failed read as error, keeps the last good records, and calls onError', async () => {
        const dbName = nextDb();
        const onError = vi.fn();
        const { result, rerender } = renderHook(
            (props: { index?: string }) =>
                useIndexedDBCollection<Note>({ dbName, onError, ...props }),
            { initialProps: {} }
        );
        await waitFor(() => expect(result.current.status).toBe('ready'));

        await act(async () => {
            await result.current.setMany(seed);
        });
        await waitFor(() => expect(result.current.items).toHaveLength(3));

        rerender({ index: 'missingIndex' });

        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.items).toHaveLength(3);
        expect(onError).toHaveBeenCalled();
    });
});

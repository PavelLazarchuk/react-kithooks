import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';

import { useIndexedDB } from './index';
import { DEFAULT_STORE_NAME, resetIndexedDBCacheForTests } from './db';
import { resetIndexedDBStoresForTests } from './store';

function resetIdb() {
    (globalThis as any).indexedDB = new IDBFactory();
    resetIndexedDBCacheForTests();
    resetIndexedDBStoresForTests();
}

describe('useIndexedDB', () => {
    beforeEach(() => {
        resetIdb();
    });

    afterEach(() => {
        resetIndexedDBCacheForTests();
        resetIndexedDBStoresForTests();
    });

    it('starts with the initial value while the first read is loading', () => {
        const { result } = renderHook(() => useIndexedDB('count', 0, { dbName: 'db-1' }));
        expect(result.current[0]).toBe(0);
        expect(result.current[3]).toBe('loading');
    });

    it('reports ready with the initial value once the (empty) read resolves', async () => {
        const { result } = renderHook(() => useIndexedDB('count', 0, { dbName: 'db-2' }));
        await waitFor(() => expect(result.current[3]).toBe('ready'));
        expect(result.current[0]).toBe(0);
    });

    it('does not write the initial value on mount', async () => {
        const { result } = renderHook(() => useIndexedDB('count', 0, { dbName: 'db-3' }));
        await waitFor(() => expect(result.current[3]).toBe('ready'));

        const other = renderHook(() => useIndexedDB('count', 999, { dbName: 'db-3' }));
        await waitFor(() => expect(other.result.current[3]).toBe('ready'));
        expect(other.result.current[0]).toBe(999);
    });

    it('setValue persists and updates the returned value', async () => {
        const { result } = renderHook(() => useIndexedDB('count', 0, { dbName: 'db-4' }));
        await waitFor(() => expect(result.current[3]).toBe('ready'));

        await act(async () => {
            await result.current[1](5);
        });
        expect(result.current[0]).toBe(5);
    });

    it('setValue accepts a functional updater', async () => {
        const { result } = renderHook(() => useIndexedDB('count', 0, { dbName: 'db-5' }));
        await waitFor(() => expect(result.current[3]).toBe('ready'));

        await act(async () => {
            await result.current[1](prev => prev + 1);
            await result.current[1](prev => prev + 1);
        });
        expect(result.current[0]).toBe(2);
    });

    it('removeValue clears the record and reverts to the initial value', async () => {
        const { result } = renderHook(() => useIndexedDB('count', 0, { dbName: 'db-6' }));
        await waitFor(() => expect(result.current[3]).toBe('ready'));

        await act(async () => {
            await result.current[1](5);
        });
        expect(result.current[0]).toBe(5);

        await act(async () => {
            await result.current[2]();
        });
        expect(result.current[0]).toBe(0);
    });

    it('syncs two hook instances for the same key in the same tab', async () => {
        const a = renderHook(() => useIndexedDB('count', 0, { dbName: 'db-7' }));
        const b = renderHook(() => useIndexedDB('count', 0, { dbName: 'db-7' }));
        await waitFor(() => expect(a.result.current[3]).toBe('ready'));
        await waitFor(() => expect(b.result.current[3]).toBe('ready'));

        await act(async () => {
            await a.result.current[1](7);
        });
        expect(b.result.current[0]).toBe(7);
    });

    it('round-trips a Date through structured clone', async () => {
        const when = new Date('2026-01-02T03:04:05Z');
        const { result } = renderHook(() =>
            useIndexedDB<Date | null>('when', null, { dbName: 'db-8' })
        );
        await waitFor(() => expect(result.current[3]).toBe('ready'));

        await act(async () => {
            await result.current[1](when);
        });
        expect(result.current[0]).toBeInstanceOf(Date);
        expect((result.current[0] as Date).toISOString()).toBe(when.toISOString());
    });

    it('keeps different storeNames under the same dbName independent', async () => {
        const a = renderHook(() =>
            useIndexedDB('shared-key', 'a-default', { dbName: 'db-9', storeName: 'store-a' })
        );
        const b = renderHook(() =>
            useIndexedDB('shared-key', 'b-default', { dbName: 'db-9', storeName: 'store-b' })
        );
        await waitFor(() => expect(a.result.current[3]).toBe('ready'));
        await waitFor(() => expect(b.result.current[3]).toBe('ready'));

        await act(async () => {
            await a.result.current[1]('written-to-a');
        });
        expect(a.result.current[0]).toBe('written-to-a');
        expect(b.result.current[0]).toBe('b-default');
    });

    it('creates a second store on an already-open db without breaking the first', async () => {
        const a = renderHook(() =>
            useIndexedDB('k', 'a-init', { dbName: 'db-10', storeName: 'first' })
        );
        await waitFor(() => expect(a.result.current[3]).toBe('ready'));
        await act(async () => {
            await a.result.current[1]('a-value');
        });

        const b = renderHook(() =>
            useIndexedDB('k', 'b-init', { dbName: 'db-10', storeName: 'second' })
        );
        await waitFor(() => expect(b.result.current[3]).toBe('ready'));
        expect(b.result.current[0]).toBe('b-init');

        await act(async () => {
            await b.result.current[1]('b-value');
        });
        expect(a.result.current[0]).toBe('a-value');
        expect(b.result.current[0]).toBe('b-value');
    });

    it('reacts to a foreign-tab write broadcast over BroadcastChannel', async () => {
        const { result } = renderHook(() => useIndexedDB('count', 0, { dbName: 'db-11' }));
        await waitFor(() => expect(result.current[3]).toBe('ready'));

        const { idbSet } = await import('./db');
        await idbSet('db-11', DEFAULT_STORE_NAME, 'count', 42);

        const { channelName } = await import('./store');
        const foreign = new BroadcastChannel(channelName('db-11', DEFAULT_STORE_NAME, 'count'));
        foreign.postMessage('changed');

        await waitFor(() => expect(result.current[0]).toBe(42));
        foreign.close();
    });

    it('reports unsupported when indexedDB is missing and never throws', async () => {
        delete (globalThis as any).indexedDB;
        const { result } = renderHook(() => useIndexedDB('count', 0, { dbName: 'db-12' }));
        await waitFor(() => expect(result.current[3]).toBe('unsupported'));
        expect(result.current[0]).toBe(0);
    });

    it('detaches the BroadcastChannel once every subscriber unmounts', async () => {
        const { result, unmount } = renderHook(() => useIndexedDB('count', 0, { dbName: 'db-13' }));
        await waitFor(() => expect(result.current[3]).toBe('ready'));
        unmount();

        const { channelName } = await import('./store');
        const foreign = new BroadcastChannel(channelName('db-13', DEFAULT_STORE_NAME, 'count'));
        expect(() => foreign.postMessage('changed')).not.toThrow();
        foreign.close();
    });

    it('re-resolves the initial value when key changes dynamically', async () => {
        const { result, rerender } = renderHook(
            ({ key, init }: { key: string; init: number }) =>
                useIndexedDB(key, init, { dbName: 'db-14' }),
            { initialProps: { key: 'k1', init: 1 } }
        );
        await waitFor(() => expect(result.current[3]).toBe('ready'));
        expect(result.current[0]).toBe(1);

        rerender({ key: 'k2', init: 2 });
        expect(result.current[0]).toBe(2);
        await waitFor(() => expect(result.current[3]).toBe('ready'));
        expect(result.current[0]).toBe(2);
    });
});

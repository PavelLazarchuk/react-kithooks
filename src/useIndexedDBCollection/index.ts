import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    idbClear,
    idbCount,
    idbGetMany,
    idbIterate,
    idbQuery,
    idbRemoveMany,
    idbSetMany,
    idbSupported,
} from '../internal/idb';
import type {
    IdbIndexDefinition,
    IdbIndexes,
    IdbQueryOptions,
    IdbRecord,
    IdbStoreRef,
} from '../internal/idb';
import { publishStoreChange, subscribeToStoreChanges } from '../useIndexedDB/changes';
import { DEFAULT_DB_NAME, DEFAULT_STORE_NAME } from '../useIndexedDB/db';
import type { UseIndexedDBStatus } from '../useIndexedDB';

export type IndexedDBIndexDefinition = IdbIndexDefinition;

export type IndexedDBIndexes = IdbIndexes;

export type IndexedDBRecord<T> = IdbRecord<T>;

export interface CountOptions {
    index?: string;
    range?: IDBKeyRange | IDBValidKey | null;
}

export interface UseIndexedDBCollectionOptions {
    dbName?: string;
    storeName?: string;
    indexes?: IndexedDBIndexes;
    index?: string;
    range?: IDBKeyRange | IDBValidKey | null;
    direction?: IDBCursorDirection;
    limit?: number;
    offset?: number;
    onError?: (error: unknown) => void;
}

export interface UseIndexedDBCollectionReturn<T> {
    items: T[];
    records: IndexedDBRecord<T>[];
    status: UseIndexedDBStatus;
    refresh: () => Promise<void>;
    get: (key: string) => Promise<T | undefined>;
    getMany: (keys: readonly string[]) => Promise<(T | undefined)[]>;
    set: (key: string, value: T) => Promise<void>;
    setMany: (records: readonly IndexedDBRecord<T>[]) => Promise<void>;
    remove: (key: string) => Promise<void>;
    removeMany: (keys: readonly string[]) => Promise<void>;
    clear: () => Promise<void>;
    count: (options?: CountOptions) => Promise<number>;
    iterate: (visit: (record: IndexedDBRecord<T>) => boolean | void) => Promise<void>;
}

interface CollectionState<T> {
    status: UseIndexedDBStatus;
    records: IndexedDBRecord<T>[];
}

const EMPTY: never[] = [];

function describeRange(range: IDBKeyRange | IDBValidKey | null | undefined): string {
    if (range === null || range === undefined) return 'all';

    if (typeof IDBKeyRange !== 'undefined' && range instanceof IDBKeyRange) {
        return JSON.stringify([
            'range',
            range.lower ?? null,
            range.upper ?? null,
            range.lowerOpen,
            range.upperOpen,
        ]);
    }

    return JSON.stringify(['key', range]);
}

function querySignature(options: UseIndexedDBCollectionOptions): string {
    return JSON.stringify([
        options.index ?? null,
        describeRange(options.range),
        options.direction ?? null,
        options.limit ?? null,
        options.offset ?? null,
        options.indexes ?? null,
    ]);
}

/**
 * The collection half of `useIndexedDB`: instead of one key held as state,
 * a live view over a whole object store — read through a cursor, written in
 * batches, and queried by index.
 *
 * `useIndexedDB` is the right tool for a handful of known keys. Once the
 * store holds thousands of records, reading them one key at a time is the
 * wrong shape: this hook opens a single cursor per read and hands back
 * `records` (key + value) in index order, sliced by `limit`/`offset`, so a
 * table renders a page at a time instead of materialising the store.
 *
 * Indexes are declared, not migrated: pass `indexes` and the store is
 * created — or the database version bumped and the index added to an
 * existing store — on demand, the same way `useIndexedDB` creates stores.
 * Query one with `index`, narrowed by `range` (an `IDBKeyRange` or a bare
 * key) and ordered by `direction`.
 *
 * Writes are batched in one transaction (`setMany`, `removeMany`) and are
 * all-or-nothing — a failure aborts the whole batch rather than leaving half
 * of it applied. Every write, from this hook or from a `useIndexedDB` on the
 * same store, refreshes both in this tab and in every other tab on the
 * origin.
 *
 * For work too large to materialise at all — exporting, counting, migrating —
 * `iterate` walks the cursor and hands you one record at a time; return
 * `false` from the visitor to stop early. `count` answers "how many" without
 * reading any values.
 *
 * A failed read surfaces as `status: 'error'` and keeps the last good
 * `records`. A failed write rejects the promise it returned; await it, or
 * pass `onError` and use the `void setMany(…)` form.
 */
export function useIndexedDBCollection<T = unknown>(
    options: UseIndexedDBCollectionOptions = {}
): UseIndexedDBCollectionReturn<T> {
    const {
        dbName = DEFAULT_DB_NAME,
        storeName = DEFAULT_STORE_NAME,
        indexes,
        index,
        range,
        direction,
        limit,
        offset,
    } = options;

    const signature = querySignature(options);

    const storeRef = useRef<IdbStoreRef>({ dbName, storeName, indexes });
    storeRef.current = { dbName, storeName, indexes };

    const queryRef = useRef<IdbQueryOptions>({ index, range, direction, limit, offset });
    queryRef.current = { index, range, direction, limit, offset };

    const onErrorRef = useRef(options.onError);
    onErrorRef.current = options.onError;

    const [state, setState] = useState<CollectionState<T>>({
        status: 'loading',
        records: EMPTY,
    });

    const loadRef = useRef<() => Promise<void>>(() => Promise.resolve());

    useEffect(() => {
        let active = true;

        const load = async () => {
            if (!idbSupported()) {
                if (active) setState({ status: 'unsupported', records: EMPTY });

                return;
            }

            try {
                const records = await idbQuery<T>(storeRef.current, queryRef.current);

                if (active) setState({ status: 'ready', records });
            } catch (error) {
                if (active) setState(prev => ({ status: 'error', records: prev.records }));

                onErrorRef.current?.(error);
            }
        };

        loadRef.current = load;
        setState(prev => (prev.status === 'loading' ? prev : { ...prev, status: 'loading' }));

        void load();

        const unsubscribe = subscribeToStoreChanges(dbName, storeName, () => void load());

        return () => {
            active = false;
            unsubscribe();
        };
    }, [dbName, storeName, signature]);

    const run = useCallback(<R>(op: () => Promise<R>, changedKey?: string | null): Promise<R> => {
        const result = op().then(value => {
            if (changedKey !== undefined) {
                publishStoreChange(storeRef.current.dbName, storeRef.current.storeName, changedKey);
            }

            return value;
        });
        const onError = onErrorRef.current;

        if (onError) result.catch(error => onError(error));

        return result;
    }, []);

    const refresh = useCallback(() => loadRef.current(), []);

    const get = useCallback(
        (key: string) =>
            run(() => idbGetMany<T>(storeRef.current, [key]).then(values => values[0])),
        [run]
    );

    const getMany = useCallback(
        (keys: readonly string[]) => run(() => idbGetMany<T>(storeRef.current, keys)),
        [run]
    );

    const set = useCallback(
        (key: string, value: T) =>
            run(() => idbSetMany<T>(storeRef.current, [{ key, value }]), key),
        [run]
    );

    const setMany = useCallback(
        (records: readonly IndexedDBRecord<T>[]) =>
            run(() => idbSetMany<T>(storeRef.current, records), null),
        [run]
    );

    const remove = useCallback(
        (key: string) => run(() => idbRemoveMany(storeRef.current, [key]), key),
        [run]
    );

    const removeMany = useCallback(
        (keys: readonly string[]) => run(() => idbRemoveMany(storeRef.current, keys), null),
        [run]
    );

    const clear = useCallback(() => run(() => idbClear(storeRef.current), null), [run]);

    const count = useCallback(
        (countOptions?: CountOptions) =>
            run(() =>
                idbCount(storeRef.current, {
                    index:
                        countOptions && 'index' in countOptions
                            ? countOptions.index
                            : queryRef.current.index,
                    range:
                        countOptions && 'range' in countOptions
                            ? countOptions.range
                            : queryRef.current.range,
                })
            ),
        [run]
    );

    const iterate = useCallback(
        (visit: (record: IndexedDBRecord<T>) => boolean | void) =>
            run(() => idbIterate<T>(storeRef.current, queryRef.current, visit)),
        [run]
    );

    const items = useMemo(() => state.records.map(record => record.value), [state.records]);

    return {
        items,
        records: state.records,
        status: state.status,
        refresh,
        get,
        getMany,
        set,
        setMany,
        remove,
        removeMany,
        clear,
        count,
        iterate,
    };
}

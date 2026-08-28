import { useCallback, useRef, useSyncExternalStore } from 'react';

import { DEFAULT_DB_NAME, DEFAULT_STORE_NAME } from './db';
import { getIndexedDBStore } from './store';
import type { IndexedDBEntry, IndexedDBStatus } from './store';

export interface UseIndexedDBOptions {
    dbName?: string;
    storeName?: string;
    onError?: (error: unknown) => void;
}

export type UseIndexedDBStatus = IndexedDBStatus;

export type UseIndexedDBReturn<T> = [
    value: T,
    setValue: (next: T | ((prev: T) => T)) => Promise<void>,
    removeValue: () => Promise<void>,
    status: UseIndexedDBStatus,
];

function resolveInitial<T>(initialValue: T | (() => T)): T {
    return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
}

const SERVER_SNAPSHOT: IndexedDBEntry<never> = { status: 'loading', value: undefined };

/**
 * IndexedDB-backed state, reactive across every hook instance in the current
 * tab and every other tab on the same origin (via `BroadcastChannel`, since
 * IndexedDB — unlike localStorage — fires no native cross-tab storage
 * event). Values pass through structured clone, not JSON, so `Date`, `Map`,
 * `Set`, `Blob`, `ArrayBuffer`, etc. round-trip intact.
 *
 * Reads are inherently async (IndexedDB has no synchronous read API): `value`
 * holds `initialValue` until the first read resolves, then reflects storage
 * from then on. Track `status` if you need to distinguish "still loading"
 * from "confirmed absent". Like `useLocalStorage`, `initialValue` is purely
 * a fallback — nothing is written until `setValue` is called.
 *
 * The backing object store is created on demand — including bumping the
 * database version to add a *new* store to an *existing* database — so
 * several hooks can share one `dbName` with different `storeName`s without
 * hand-rolled `onupgradeneeded` migrations. Uses its own database
 * (`"react-kithooks:db"` by default), separate from `useFormCrashRecovery`'s
 * internal one, so the two features can't bump each other's version out from
 * under one another.
 *
 * A failed write surfaces as `status: 'error'` and rejects the promise
 * `setValue`/`removeValue` returned. Await that promise, or pass `onError`
 * and use the `void setValue(…)` form.
 */
export function useIndexedDB<T>(
    key: string,
    initialValue: T | (() => T),
    options: UseIndexedDBOptions = {}
): UseIndexedDBReturn<T> {
    const { dbName = DEFAULT_DB_NAME, storeName = DEFAULT_STORE_NAME } = options;
    const store = getIndexedDBStore<T>(dbName, storeName, key);

    const identityRef = useRef<{ dbName: string; storeName: string; key: string; value: T } | null>(
        null
    );

    const getInitial = (): T => {
        const cached = identityRef.current;

        if (
            cached === null ||
            cached.dbName !== dbName ||
            cached.storeName !== storeName ||
            cached.key !== key
        ) {
            const value = resolveInitial(initialValue);
            identityRef.current = { dbName, storeName, key, value };
            return value;
        }

        return cached.value;
    };

    const getSnapshot = useCallback(() => store.getSnapshot(), [store]);
    const getServerSnapshot = useCallback(() => SERVER_SNAPSHOT as IndexedDBEntry<T>, []);

    const entry = useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot);
    const value =
        entry.status === 'ready' && entry.value !== undefined ? entry.value : getInitial();

    const onErrorRef = useRef(options.onError);
    onErrorRef.current = options.onError;

    const withErrorHandler = useCallback((promise: Promise<void>): Promise<void> => {
        const onError = onErrorRef.current;

        if (onError) promise.catch(error => onError(error));

        return promise;
    }, []);

    const setValue = useCallback(
        (next: T | ((prev: T) => T)) => {
            const latest = store.peekLatestValue();
            const prev = latest.hasValue ? (latest.value as T) : getInitial();
            const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next;

            return withErrorHandler(store.set(resolved));
        },
        [store, withErrorHandler] // eslint-disable-line react-hooks/exhaustive-deps
    );

    const removeValue = useCallback(
        () => withErrorHandler(store.remove()),
        [store, withErrorHandler]
    );

    return [value, setValue, removeValue, entry.status];
}

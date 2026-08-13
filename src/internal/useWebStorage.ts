import { useCallback, useRef, useSyncExternalStore } from 'react';

import type { WebStorageStore } from './webStorageStore';

export interface UseWebStorageOptions<T> {
    serialize?: (value: T) => string;
    deserialize?: (raw: string) => T;
    syncTabs?: boolean;
}

export type UseWebStorageReturn<T> = [
    value: T,
    setValue: (next: T | ((prev: T) => T)) => void,
    removeValue: () => void,
];

function resolveInitial<T>(initialValue: T | (() => T)): T {
    return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
}

export function useWebStorage<T>(
    getStore: (key: string) => WebStorageStore,
    key: string,
    initialValue: T | (() => T),
    options?: UseWebStorageOptions<T>
): UseWebStorageReturn<T> {
    const store = getStore(key);
    const syncTabs = options?.syncTabs ?? true;
    const readRaw = syncTabs ? store.getSnapshot : store.getLocalSnapshot;

    const serialize = options?.serialize ?? (JSON.stringify as (value: T) => string);
    const deserialize = options?.deserialize ?? (JSON.parse as (raw: string) => T);

    const serializeRef = useRef(serialize);
    serializeRef.current = serialize;
    const deserializeRef = useRef(deserialize);
    deserializeRef.current = deserialize;

    const initialRef = useRef<{ key: string; value: T } | null>(null);

    const getInitial = (): T => {
        if (initialRef.current === null || initialRef.current.key !== key) {
            initialRef.current = { key, value: resolveInitial(initialValue) };
        }

        return initialRef.current.value;
    };

    const parsedRef = useRef<{ raw: string | null; value: T } | null>(null);

    const getSnapshot = useCallback((): T => {
        const raw = readRaw();

        if (raw === null) return getInitial();
        if (parsedRef.current !== null && parsedRef.current.raw === raw) {
            return parsedRef.current.value;
        }

        try {
            const value = deserializeRef.current(raw);
            parsedRef.current = { raw, value };
            return value;
        } catch {
            return getInitial();
        }
    }, [readRaw]); // eslint-disable-line react-hooks/exhaustive-deps

    const getServerSnapshot = useCallback(
        () => getInitial(),
        [] // eslint-disable-line react-hooks/exhaustive-deps
    );

    const value = useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot);

    const setValue = useCallback(
        (next: T | ((prev: T) => T)) => {
            const resolved =
                typeof next === 'function' ? (next as (prev: T) => T)(getSnapshot()) : next;
            store.set(serializeRef.current(resolved));
        },
        [store, getSnapshot]
    );

    const removeValue = useCallback(() => store.set(null), [store]);

    return [value, setValue, removeValue];
}

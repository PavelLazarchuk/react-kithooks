import { useWebStorage } from '../internal/useWebStorage';
import type { UseWebStorageOptions, UseWebStorageReturn } from '../internal/useWebStorage';
import { getStorageStore } from './store';

export type UseSessionStorageOptions<T> = UseWebStorageOptions<T>;
export type UseSessionStorageReturn<T> = UseWebStorageReturn<T>;

export function useSessionStorage<T>(
    key: string,
    initialValue: T | (() => T),
    options?: UseSessionStorageOptions<T>
): UseSessionStorageReturn<T> {
    return useWebStorage(getStorageStore, key, initialValue, options);
}

import { useWebStorage } from '../internal/useWebStorage';
import type { UseWebStorageOptions, UseWebStorageReturn } from '../internal/useWebStorage';
import { getStorageStore } from './store';

export type UseLocalStorageOptions<T> = UseWebStorageOptions<T>;
export type UseLocalStorageReturn<T> = UseWebStorageReturn<T>;

export function useLocalStorage<T>(
    key: string,
    initialValue: T | (() => T),
    options?: UseLocalStorageOptions<T>
): UseLocalStorageReturn<T> {
    return useWebStorage(getStorageStore, key, initialValue, options);
}

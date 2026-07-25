import { createWebStorageStoreCache } from '../internal/webStorageStore';
import type { WebStorageStore } from '../internal/webStorageStore';

const stores = createWebStorageStoreCache(() => localStorage);

export function getStorageStore(key: string): WebStorageStore {
    return stores.get(key);
}

export function resetStorageStores(): void {
    stores.reset();
}

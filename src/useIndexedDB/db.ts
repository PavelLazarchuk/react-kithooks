import {
    idbGet,
    idbRemove,
    idbSet,
    idbSupported,
    resetIdbConnectionsForTests,
} from '../internal/idb';

export const DEFAULT_DB_NAME = 'react-kithooks:db';
export const DEFAULT_STORE_NAME = 'db';

export { idbGet, idbRemove, idbSet, idbSupported };

export function resetIndexedDBCacheForTests(): void {
    resetIdbConnectionsForTests();
}

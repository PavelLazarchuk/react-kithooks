import {
    idbGet as coreGet,
    idbRemove as coreRemove,
    idbSet as coreSet,
    idbSupported,
    idbSweep,
    resetIdbConnectionsForTests,
} from '../internal/idb';

const DB_NAME = 'react-kithooks:drafts';
const STORE = 'drafts';

export { idbSupported };

export function idbGet<T>(key: string): Promise<T | undefined> {
    return coreGet<T>(DB_NAME, STORE, key);
}

export function idbPut(key: string, value: unknown): Promise<void> {
    return coreSet(DB_NAME, STORE, key, value);
}

export function idbDelete(key: string): Promise<void> {
    return coreRemove(DB_NAME, STORE, key);
}

/** Opportunistic housekeeping: drop every record past its own recorded TTL. */
export function idbSweepExpired(now: number): Promise<void> {
    return idbSweep(DB_NAME, STORE, value => {
        const rec = value as { savedAt?: unknown; ttlMs?: unknown } | undefined;

        return (
            !!rec &&
            typeof rec.savedAt === 'number' &&
            typeof rec.ttlMs === 'number' &&
            rec.savedAt + rec.ttlMs < now
        );
    });
}

export function resetIdbCacheForTests(): void {
    resetIdbConnectionsForTests();
}

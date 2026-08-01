import { startElection } from './election';
import type { TabLeaderMechanism, TabLeaderStatus } from './election';
import { createDisposeScheduler } from '../internal/disposeWhenUnused';
import { createKeyedCache } from '../internal/keyedCache';
import { createLazyStore } from '../internal/lazyStore';

export type { TabLeaderMechanism, TabLeaderStatus };

export interface TabLeaderSnapshot {
    status: TabLeaderStatus;
    mechanism: TabLeaderMechanism | null;
}

export interface TabLeaderStore {
    getSnapshot: () => TabLeaderSnapshot;
    subscribe: (listener: () => void) => () => void;
}

const IDLE_SNAPSHOT: TabLeaderSnapshot = { status: 'pending', mechanism: null };

function createStore(key: string, onDisposable: (store: TabLeaderStore) => void): TabLeaderStore {
    let snapshot: TabLeaderSnapshot = IDLE_SNAPSHOT;
    let election: ReturnType<typeof startElection> | null = null;

    const store: TabLeaderStore = {
        getSnapshot: () => snapshot,
        subscribe: listener => lazyStore.subscribe(listener),
    };

    const lazyStore = createLazyStore(
        () => {
            election = startElection(key, {
                onStatusChange: status => {
                    snapshot = { status, mechanism: election?.mechanism ?? null };
                    lazyStore.notify();
                },
            });
        },
        () => {
            election?.stop();
            election = null;
            snapshot = IDLE_SNAPSHOT;
            scheduleDispose();
        }
    );

    const scheduleDispose = createDisposeScheduler(
        () => lazyStore.size === 0,
        () => onDisposable(store)
    );

    return store;
}

const stores = createKeyedCache((key: string) =>
    createStore(key, store => {
        if (stores.peek(key) === store) stores.delete(key);
    })
);

export function getTabLeaderStore(key: string): TabLeaderStore {
    return stores.get(key);
}

export function resetTabLeaderStoresForTests(): void {
    stores.reset();
}

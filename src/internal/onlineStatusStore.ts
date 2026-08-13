import { createLazyStore } from './lazyStore';

export interface OnlineStatusStore {
    getSnapshot: () => boolean;
    subscribe: (listener: () => void) => () => void;
    set: (next: boolean) => void;
    beginPing: () => number;
    commitPing: (id: number, next: boolean) => void;
}

const DEBOUNCE_MS = 300;

function createStore(): OnlineStatusStore {
    let snapshot = typeof navigator === 'undefined' ? true : navigator.onLine;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pingSeq = 0;

    const set = (next: boolean) => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        if (next === snapshot) return;

        snapshot = next;
        lazyStore.notify();
    };

    const beginPing = () => ++pingSeq;
    const commitPing = (id: number, next: boolean) => {
        if (id === pingSeq) set(next);
    };

    const handleBrowserEvent = () => {
        if (debounceTimer) clearTimeout(debounceTimer);

        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            set(navigator.onLine);
        }, DEBOUNCE_MS);
    };

    const attach = () => {
        if (typeof window === 'undefined') return;

        window.addEventListener('online', handleBrowserEvent);
        window.addEventListener('offline', handleBrowserEvent);

        // The store outlives its subscribers. Between the last unsubscribe and
        // this re-attach nobody was listening for `online`/`offline`, so the
        // snapshot can describe a network state several events out of date —
        // re-read it instead of reporting the stale one until the next event.
        if (typeof navigator !== 'undefined') set(navigator.onLine);
    };

    const detach = () => {
        if (typeof window === 'undefined') return;

        window.removeEventListener('online', handleBrowserEvent);
        window.removeEventListener('offline', handleBrowserEvent);

        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
    };

    const lazyStore = createLazyStore(attach, detach);

    return {
        getSnapshot: () => snapshot,
        subscribe: lazyStore.subscribe,
        set,
        beginPing,
        commitPing,
    };
}

let store: OnlineStatusStore | null = null;

export function getOnlineStatusStore(): OnlineStatusStore {
    if (!store) store = createStore();
    return store;
}

export function resetOnlineStatusStore(): void {
    store = null;
}

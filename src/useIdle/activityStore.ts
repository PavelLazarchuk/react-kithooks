import { createDisposeScheduler } from '../internal/disposeWhenUnused';
import { createKeyedCache } from '../internal/keyedCache';
import { createLazyStore } from '../internal/lazyStore';

export const DEFAULT_ACTIVITY_EVENTS = [
    'mousemove',
    'mousedown',
    'keydown',
    'wheel',
    'touchstart',
    'touchmove',
    'scroll',
];

const NOTIFY_THROTTLE_MS = 500;
const BROADCAST_THROTTLE_MS = 2_000;
const CHANNEL_PREFIX = 'react-kithooks:idle';

export interface ActivityStore {
    getLastActivity: () => number;
    subscribe: (listener: () => void) => () => void;
    markActive: () => void;
}

export function buildStoreKey(
    events: readonly string[] | undefined,
    syncAcrossTabs: boolean
): string {
    const source = events && events.length > 0 ? events : DEFAULT_ACTIVITY_EVENTS;
    const canonical = [...new Set(source)].sort().join(',');

    return `${syncAcrossTabs ? 'sync' : 'local'}|${canonical}`;
}

function createStore(
    storeKey: string,
    onDisposable: (store: ActivityStore) => void
): ActivityStore {
    const separator = storeKey.indexOf('|');
    const syncAcrossTabs = storeKey.slice(0, separator) === 'sync';
    const events = storeKey.slice(separator + 1).split(',');

    let lastActivityAt = Date.now();
    let lastNotifyAt = 0;
    let notifyTimer: ReturnType<typeof setTimeout> | null = null;
    let lastBroadcastAt = 0;
    let channel: BroadcastChannel | null = null;

    const clearNotifyTimer = () => {
        if (notifyTimer === null) return;

        clearTimeout(notifyTimer);
        notifyTimer = null;
    };

    const notifyNow = () => {
        clearNotifyTimer();
        lastNotifyAt = Date.now();
        lazyStore.notify();
    };

    const scheduleNotify = () => {
        const elapsed = Date.now() - lastNotifyAt;

        if (elapsed >= NOTIFY_THROTTLE_MS) {
            notifyNow();
            return;
        }

        if (notifyTimer !== null) return;

        notifyTimer = setTimeout(notifyNow, NOTIFY_THROTTLE_MS - elapsed);
    };

    const broadcast = () => {
        if (!channel) return;

        const now = Date.now();

        if (now - lastBroadcastAt < BROADCAST_THROTTLE_MS) return;

        lastBroadcastAt = now;

        try {
            channel.postMessage('active');
        } catch {
            // empty
        }
    };

    const record = (shouldBroadcast: boolean) => {
        lastActivityAt = Date.now();

        if (shouldBroadcast) broadcast();

        scheduleNotify();
    };

    const handleEvent = () => record(true);

    const listenerOptions = { passive: true, capture: true } as const;

    const attachChannel = () => {
        if (!syncAcrossTabs || channel || typeof BroadcastChannel === 'undefined') return;

        channel = new BroadcastChannel(`${CHANNEL_PREFIX}:${storeKey}`);
        channel.onmessage = () => record(false);
    };

    const detachChannel = () => {
        channel?.close();
        channel = null;
        lastBroadcastAt = 0;
    };

    const attach = () => {
        if (typeof window === 'undefined') return;

        lastActivityAt = Date.now();

        for (const type of events) {
            window.addEventListener(type, handleEvent, listenerOptions);
        }

        attachChannel();
    };

    const detach = () => {
        if (typeof window === 'undefined') return;

        for (const type of events) {
            window.removeEventListener(type, handleEvent, listenerOptions);
        }

        detachChannel();
        clearNotifyTimer();
        lastNotifyAt = 0;
    };

    const store: ActivityStore = {
        getLastActivity: () => lastActivityAt,
        subscribe: listener => lazyStore.subscribe(listener),
        markActive: () => {
            lastActivityAt = Date.now();
            broadcast();
            notifyNow();
        },
    };

    const scheduleDispose = createDisposeScheduler(
        () => lazyStore.size === 0,
        () => onDisposable(store)
    );

    const lazyStore = createLazyStore(attach, () => {
        detach();
        scheduleDispose();
    });

    return store;
}

const stores = createKeyedCache((storeKey: string) =>
    createStore(storeKey, store => {
        if (stores.peek(storeKey) === store) stores.delete(storeKey);
    })
);

export function getActivityStore(storeKey: string): ActivityStore {
    return stores.get(storeKey);
}

export function resetActivityStoresForTests(): void {
    stores.reset();
}

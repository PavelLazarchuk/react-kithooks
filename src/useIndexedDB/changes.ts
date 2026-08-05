import { createKeyedCache } from '../internal/keyedCache';

export type StoreChangeListener = (key: string | null) => void;

interface ChangeHub {
    dbName: string;
    storeName: string;
    listeners: Set<StoreChangeListener>;
    channel: BroadcastChannel | null;
}

export function channelName(dbName: string, storeName: string): string {
    return ['react-kithooks:idb', dbName, storeName].join(':');
}

const liveHubs = new Set<ChangeHub>();

const hubs = createKeyedCache((dbName: string) =>
    createKeyedCache((storeName: string): ChangeHub => {
        const hub: ChangeHub = {
            dbName,
            storeName,
            listeners: new Set(),
            channel: null,
        };

        liveHubs.add(hub);

        return hub;
    })
);

function getHub(dbName: string, storeName: string): ChangeHub {
    return hubs.get(dbName).get(storeName);
}

function notifyLocal(hub: ChangeHub, key: string | null, source?: StoreChangeListener): void {
    for (const listener of [...hub.listeners]) {
        if (listener !== source) listener(key);
    }
}

function openChannel(hub: ChangeHub): void {
    if (hub.channel || typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(channelName(hub.dbName, hub.storeName));

    channel.onmessage = event => {
        const data = event.data as { key?: string | null } | null;

        notifyLocal(hub, data?.key ?? null);
    };
    hub.channel = channel;
}

function closeChannel(hub: ChangeHub): void {
    hub.channel?.close();
    hub.channel = null;
}

export function subscribeToStoreChanges(
    dbName: string,
    storeName: string,
    listener: StoreChangeListener
): () => void {
    const hub = getHub(dbName, storeName);

    hub.listeners.add(listener);

    if (hub.listeners.size === 1) openChannel(hub);

    return () => {
        hub.listeners.delete(listener);

        if (hub.listeners.size === 0) closeChannel(hub);
    };
}

export function publishStoreChange(
    dbName: string,
    storeName: string,
    key: string | null,
    source?: StoreChangeListener
): void {
    const hub = getHub(dbName, storeName);

    notifyLocal(hub, key, source);

    if (hub.channel) {
        hub.channel.postMessage({ key });

        return;
    }

    if (typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(channelName(dbName, storeName));

    channel.postMessage({ key });
    channel.close();
}

export function resetStoreChangesForTests(): void {
    for (const hub of liveHubs) {
        hub.listeners.clear();
        closeChannel(hub);
    }

    liveHubs.clear();
    hubs.reset();
}

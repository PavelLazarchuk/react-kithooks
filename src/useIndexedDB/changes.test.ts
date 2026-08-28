import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    channelName,
    publishStoreChange,
    resetStoreChangesForTests,
    subscribeToStoreChanges,
} from './changes';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('changes', () => {
    beforeEach(() => {
        resetStoreChangesForTests();
    });

    afterEach(() => {
        resetStoreChangesForTests();
    });

    it('publishes to a fresh ad-hoc BroadcastChannel when there are no local listeners', async () => {
        const foreign = new BroadcastChannel(channelName('db-adhoc', 'store-adhoc'));
        const received: (string | null)[] = [];

        foreign.onmessage = event => received.push((event.data as { key: string | null }).key);

        publishStoreChange('db-adhoc', 'store-adhoc', 'k1');
        await flush();

        expect(received).toEqual(['k1']);
        foreign.close();
    });

    it('keeps the channel open for remaining listeners after one unsubscribes', async () => {
        const listenerA: (key: string | null) => void = () => undefined;
        const seenB: (string | null)[] = [];
        const listenerB = (key: string | null) => seenB.push(key);

        const unsubscribeA = subscribeToStoreChanges('db-multi', 'store-multi', listenerA);
        subscribeToStoreChanges('db-multi', 'store-multi', listenerB);

        unsubscribeA();

        const foreign = new BroadcastChannel(channelName('db-multi', 'store-multi'));

        foreign.postMessage({ key: 'still-open' });
        await flush();

        expect(seenB).toEqual(['still-open']);
        foreign.close();
    });

    it('falls back to local-only notification when BroadcastChannel is unavailable', async () => {
        const original = globalThis.BroadcastChannel;

        // @ts-expect-error - simulating an environment without BroadcastChannel support
        delete globalThis.BroadcastChannel;

        try {
            const seen: (string | null)[] = [];
            const unsubscribe = subscribeToStoreChanges('db-nochannel', 'store-nochannel', key =>
                seen.push(key)
            );

            expect(() =>
                publishStoreChange('db-nochannel', 'store-nochannel', 'ignored')
            ).not.toThrow();

            unsubscribe();
        } finally {
            globalThis.BroadcastChannel = original;
        }
    });

    it('notifies listeners locally without needing a channel, and excludes the source listener', () => {
        const seenA: (string | null)[] = [];
        const seenB: (string | null)[] = [];
        const listenerA = (key: string | null) => seenA.push(key);
        const listenerB = (key: string | null) => seenB.push(key);

        subscribeToStoreChanges('db-local', 'store-local', listenerA);
        subscribeToStoreChanges('db-local', 'store-local', listenerB);

        publishStoreChange('db-local', 'store-local', 'k', listenerA);

        expect(seenA).toEqual([]);
        expect(seenB).toEqual(['k']);
    });

    it('builds a stable, namespaced channel name from dbName and storeName', () => {
        expect(channelName('my-db', 'my-store')).toBe('react-kithooks:idb:my-db:my-store');
    });
});

import { useEffect, useRef, useSyncExternalStore } from 'react';

import { getTabLeaderStore } from './store';
import type { TabLeaderMechanism, TabLeaderSnapshot, TabLeaderStatus } from './store';

export type { TabLeaderMechanism, TabLeaderStatus };

export interface UseTabLeaderOptions {
    onBecomeLeader?: () => void;
    onBecomeFollower?: () => void;
}

export interface UseTabLeaderReturn {
    isLeader: boolean;
    status: TabLeaderStatus;
    mechanism: TabLeaderMechanism | null;
}

const SERVER_SNAPSHOT: TabLeaderSnapshot = { status: 'pending', mechanism: null };
const getServerSnapshot = () => SERVER_SNAPSHOT;

/**
 * Elects exactly one tab as the leader for `key`, across every tab and
 * window open on the origin — so a websocket, a poller, or a sync job runs
 * once for the whole browser session instead of once per open tab.
 *
 * Backed by the Web Locks API where it's available: the browser itself
 * queues one `navigator.locks.request()` per tab and grants them one at a
 * time, so leadership transfers the instant the leader's tab closes or
 * crashes — no heartbeat, no stale-lock window, no naive
 * `localStorage`-timestamp race. Where Web Locks isn't available, this
 * falls back to exactly that `localStorage` heartbeat election, with a
 * bounded (not instant) failover on an unclean close — see the docs.
 *
 * Multiple `useTabLeader(key)` calls in the same tab share one election, so
 * mounting the hook in several components never contends with itself.
 */
export function useTabLeader(key: string, options: UseTabLeaderOptions = {}): UseTabLeaderReturn {
    const store = getTabLeaderStore(key);

    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, getServerSnapshot);

    const onBecomeLeaderRef = useRef(options.onBecomeLeader);
    onBecomeLeaderRef.current = options.onBecomeLeader;
    const onBecomeFollowerRef = useRef(options.onBecomeFollower);
    onBecomeFollowerRef.current = options.onBecomeFollower;

    const prevStatusRef = useRef<TabLeaderStatus | null>(null);
    const prevKeyRef = useRef(key);

    useEffect(() => {
        if (prevKeyRef.current !== key) {
            prevKeyRef.current = key;
            prevStatusRef.current = null;
        }

        const prev = prevStatusRef.current;

        if (prev === snapshot.status) return;

        prevStatusRef.current = snapshot.status;

        if (snapshot.status === 'leader' && prev !== 'leader') onBecomeLeaderRef.current?.();
        if (prev === 'leader' && snapshot.status !== 'leader') onBecomeFollowerRef.current?.();
    }, [key, snapshot.status]);

    return {
        isLeader: snapshot.status === 'leader',
        status: snapshot.status,
        mechanism: snapshot.mechanism,
    };
}

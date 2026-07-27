import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { getOnlineStatusStore } from '../internal/onlineStatusStore';

export interface UseOnlineStatusOptions {
    pingUrl?: string;
    pingIntervalMs?: number;
    pingTimeoutMs?: number;
}

export interface UseOnlineStatusReturn {
    isOnline: boolean;
    recheck: () => Promise<boolean>;
}

async function ping(url: string, timeoutMs: number): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        // `no-cors` because a cross-origin endpoint without CORS headers would
        // otherwise reject exactly like a dead network and be reported as
        // offline — the most likely way to misconfigure this hook, and one
        // that fails silently.
        await fetch(url, {
            method: 'HEAD',
            cache: 'no-store',
            mode: 'no-cors',
            signal: controller.signal,
        });

        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Reactive `navigator.onLine`, corrected for its known false positive: it
 * reports "online" whenever the network interface is up, even with no
 * actual internet access. With `pingUrl`, a lightweight HEAD request
 * re-verifies real connectivity on mount, on an interval while the tab is
 * visible, and on demand via `recheck()`.
 */
export function useOnlineStatus(options: UseOnlineStatusOptions = {}): UseOnlineStatusReturn {
    const { pingUrl, pingIntervalMs = 30_000, pingTimeoutMs = 5_000 } = options;
    const store = getOnlineStatusStore();

    const isOnline = useSyncExternalStore(store.subscribe, store.getSnapshot, () => true);

    const recheck = useCallback(async (): Promise<boolean> => {
        if (!pingUrl) return store.getSnapshot();

        const id = store.beginPing();
        const result = await ping(pingUrl, pingTimeoutMs);
        store.commitPing(id, result);

        return result;
    }, [pingUrl, pingTimeoutMs, store]);

    const recheckRef = useRef(recheck);
    recheckRef.current = recheck;

    useEffect(() => {
        if (!pingUrl) return;

        const runIfVisible = () => {
            if (document.visibilityState === 'visible') void recheckRef.current();
        };
        runIfVisible();
        const interval = setInterval(runIfVisible, pingIntervalMs);
        document.addEventListener('visibilitychange', runIfVisible);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', runIfVisible);
        };
    }, [pingUrl, pingIntervalMs]);

    return { isOnline, recheck };
}

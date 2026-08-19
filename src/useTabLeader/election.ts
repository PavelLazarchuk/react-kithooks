export type TabLeaderStatus = 'pending' | 'leader' | 'follower';
export type TabLeaderMechanism = 'locks' | 'storage';

export interface ElectionCallbacks {
    onStatusChange: (status: TabLeaderStatus) => void;
}

export interface Election {
    readonly mechanism: TabLeaderMechanism;
    stop: () => void;
}

function lockName(key: string): string {
    return `react-kithooks:tab-leader:${key}`;
}

function supportsWebLocks(): boolean {
    return (
        typeof navigator !== 'undefined' &&
        !!navigator.locks &&
        typeof navigator.locks.request === 'function'
    );
}

function startLocksElection(key: string, callbacks: ElectionCallbacks): Election {
    const controller = new AbortController();
    let release: (() => void) | null = null;
    let stopped = false;
    let granted = false;

    navigator.locks
        .request(lockName(key), { ifAvailable: true }, lock => {
            if (lock !== null || stopped || granted) return;

            callbacks.onStatusChange('follower');
        })
        .catch(() => {
            // empty
        });

    navigator.locks
        .request(lockName(key), { mode: 'exclusive', signal: controller.signal }, () => {
            if (stopped) return;

            return new Promise<void>(resolve => {
                release = resolve;
                granted = true;
                callbacks.onStatusChange('leader');
            });
        })
        .catch(() => {
            // empty
        });

    return {
        mechanism: 'locks',
        stop: () => {
            stopped = true;
            controller.abort();
            release?.();
            release = null;
        },
    };
}

const HEARTBEAT_MS = 1_500;
const STALE_AFTER_MS = 4_000;
const SETTLE_MS = 100;

interface ClaimRecord {
    id: string;
    ts: number;
}

function storageKeyFor(key: string): string {
    return `react-kithooks:tab-leader:${key}`;
}

function readRecord(storageKey: string): ClaimRecord | null {
    try {
        const raw = localStorage.getItem(storageKey);

        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<ClaimRecord>;

        if (typeof parsed.id !== 'string' || typeof parsed.ts !== 'number') return null;

        return { id: parsed.id, ts: parsed.ts };
    } catch {
        return null;
    }
}

function writeRecord(storageKey: string, record: ClaimRecord): void {
    try {
        localStorage.setItem(storageKey, JSON.stringify(record));
    } catch {
        // empty
    }
}

function clearRecord(storageKey: string, id: string): void {
    try {
        if (readRecord(storageKey)?.id === id) localStorage.removeItem(storageKey);
    } catch {
        // empty
    }
}

function randomId(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function startStorageElection(key: string, callbacks: ElectionCallbacks): Election {
    const storageKey = storageKeyFor(key);
    const id = randomId();

    let status: TabLeaderStatus = 'pending';
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const setStatus = (next: TabLeaderStatus) => {
        if (status === next) return;

        status = next;
        callbacks.onStatusChange(next);
    };

    const startHeartbeat = () => {
        if (heartbeatTimer) return;

        heartbeatTimer = setInterval(() => {
            if (status === 'leader') writeRecord(storageKey, { id, ts: Date.now() });
        }, HEARTBEAT_MS);
    };

    const stopHeartbeat = () => {
        if (!heartbeatTimer) return;

        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    };

    const claim = () => {
        if (settleTimer) return;

        writeRecord(storageKey, { id, ts: Date.now() });

        settleTimer = setTimeout(() => {
            settleTimer = null;

            if (stopped) return;

            if (readRecord(storageKey)?.id === id) {
                setStatus('leader');
                startHeartbeat();
            } else {
                setStatus('follower');
            }
        }, SETTLE_MS);
    };

    const evaluate = () => {
        if (stopped || status === 'leader') return;

        const record = readRecord(storageKey);

        const isOurs = record?.id === id;
        const isStale = !record || isOurs || Date.now() - record.ts > STALE_AFTER_MS;

        if (isStale) claim();
        else setStatus('follower');
    };

    const handleStorage = (event: StorageEvent) => {
        if (event.key !== null && event.key !== storageKey) return;

        evaluate();
    };

    const handlePageHide = () => {
        clearRecord(storageKey, id);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('pagehide', handlePageHide);

    const startTimer = setTimeout(evaluate, Math.random() * SETTLE_MS);
    const pollTimer = setInterval(evaluate, HEARTBEAT_MS);

    return {
        mechanism: 'storage',
        stop: () => {
            stopped = true;
            clearTimeout(startTimer);
            clearInterval(pollTimer);
            if (settleTimer) clearTimeout(settleTimer);
            stopHeartbeat();
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener('pagehide', handlePageHide);

            clearRecord(storageKey, id);
        },
    };
}

export function startElection(key: string, callbacks: ElectionCallbacks): Election {
    if (supportsWebLocks()) {
        try {
            return startLocksElection(key, callbacks);
        } catch {
            // empty
        }
    }

    return startStorageElection(key, callbacks);
}

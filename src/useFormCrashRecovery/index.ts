import { useCallback, useEffect, useRef, useState } from 'react';

import { idbDelete, idbGet, idbPut, idbSupported, idbSweepExpired } from './idb';
import { omitPaths, stripNonCloneable } from './paths';
import { errorName } from '../internal/errorName';
import { isDev } from '../internal/isDev';

export interface UseFormCrashRecoveryOptions {
    key: string;
    debounceMs?: number;
    ttlMs?: number;
    exclude?: string[];
    version?: number;
    conflictStrategy?: 'last-write-wins' | 'first-tab-wins';
    onConflict?: (info: { otherTabSavedAt: number }) => void;
    disabled?: boolean;
}

export type RecoveryStatus = 'idle' | 'restoring' | 'saving' | 'saved' | 'unsupported' | 'error';

export interface RecoveredDraft<T> {
    data: T;
    savedAt: number;
}

export interface UseFormCrashRecoveryReturn<T> {
    recovered: RecoveredDraft<T> | null;
    status: RecoveryStatus;
    restore: () => T | null;
    discard: () => Promise<void>;
    clear: () => Promise<void>;
    lastSavedAt: number | null;
}

interface DraftRecord<T> {
    data: T;
    savedAt: number;
    ttlMs: number;
    version: number;
    tabId: string;
}

interface ConflictMessage {
    tabId: string;
    savedAt: number;
}

const KEY_PREFIX = 'rk:';
const TAB_ID_KEY = 'rk-tab-id';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DEBOUNCE_MS = 500;

function randomId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

let tabId: string | null = null;

function ensureTabId(): string {
    if (tabId) return tabId;

    try {
        const existing = sessionStorage.getItem(TAB_ID_KEY);
        tabId = existing ?? randomId();
        sessionStorage.setItem(TAB_ID_KEY, tabId);
    } catch {
        tabId = randomId();
    }

    return tabId;
}

function regenerateTabId(): string {
    tabId = randomId();

    try {
        sessionStorage.setItem(TAB_ID_KEY, tabId);
    } catch {
        // empty
    }

    return tabId;
}

let sweptThisSession = false;

interface PendingWrite<T> {
    fullKey: string;
    value: T;
    exclude: string[];
    ttlMs: number;
    version: number;
    debugKey: string;
}

export function useFormCrashRecovery<T extends Record<string, unknown>>(
    value: T,
    options: UseFormCrashRecoveryOptions
): UseFormCrashRecoveryReturn<T> {
    const { key, disabled = false } = options;
    const fullKey = KEY_PREFIX + key;

    const [recovered, setRecovered] = useState<RecoveredDraft<T> | null>(null);
    const [status, setStatus] = useState<RecoveryStatus>('idle');
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

    const optsRef = useRef(options);
    optsRef.current = options;
    const recoveredRef = useRef(recovered);

    const setRecoveredSynced = useCallback((next: RecoveredDraft<T> | null) => {
        recoveredRef.current = next;
        setRecovered(next);
    }, []);

    const pendingRef = useRef<PendingWrite<T> | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const firstRunRef = useRef(true);
    const prevValueRef = useRef(value);
    const stoppedRef = useRef(false);
    const persistDisabledRef = useRef(false);
    const hasWrittenRef = useRef(false);
    const channelRef = useRef<BroadcastChannel | null>(null);

    const cancelTimer = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    /**
     * Reads everything from `pendingRef` (captured when the write was
     * scheduled) rather than from `fullKey`/`value`/`options` closures. If it
     * read those live, a `key` change mid-debounce would flush the NEW form's
     * values under the OLD key (or vice versa) — refs are mutated during
     * render, so by the time an unmount/pagehide/timer callback runs they may
     * already belong to a different key than the one the write was for.
     */
    const flush = useCallback(async (): Promise<void> => {
        cancelTimer();
        const pending = pendingRef.current;

        if (!pending || stoppedRef.current || persistDisabledRef.current) return;

        const record: DraftRecord<T> = {
            data: omitPaths(pending.value, pending.exclude),
            savedAt: Date.now(),
            ttlMs: pending.ttlMs,
            version: pending.version,
            tabId: ensureTabId(),
        };

        setStatus('saving');

        try {
            try {
                await idbPut(pending.fullKey, record);
            } catch (err) {
                if (errorName(err) !== 'DataCloneError') throw err;

                const { cleaned, dropped } = stripNonCloneable(record.data);

                if (isDev) {
                    console.warn(
                        `[react-kithooks] useFormCrashRecovery("${pending.debugKey}"): dropped non-serializable ` +
                            `fields: ${dropped.join(', ')}. Exclude them explicitly via options.exclude.`
                    );
                }

                await idbPut(pending.fullKey, { ...record, data: cleaned });
            }

            pendingRef.current = null;
            hasWrittenRef.current = true;
            channelRef.current?.postMessage({
                tabId: record.tabId,
                savedAt: record.savedAt,
            } satisfies ConflictMessage);
            setLastSavedAt(record.savedAt);
            setStatus('saved');
        } catch (err) {
            if (errorName(err) === 'QuotaExceededError') {
                stoppedRef.current = true;
                pendingRef.current = null;
            }
            setStatus('error');
        }
    }, [cancelTimer]);

    // --- recovery read on mount / key change ---
    useEffect(() => {
        if (disabled) return;
        if (!idbSupported()) {
            setStatus('unsupported');
            return;
        }

        let cancelled = false;
        setStatus('restoring');
        idbGet<DraftRecord<T>>(fullKey)
            .then(rec => {
                if (cancelled) return;
                if (rec) {
                    const expired = rec.savedAt + (rec.ttlMs ?? DEFAULT_TTL_MS) < Date.now();
                    const versionMismatch = (rec.version ?? 1) !== (optsRef.current.version ?? 1);

                    if (expired || versionMismatch) {
                        void idbDelete(fullKey).catch(() => undefined);
                        setRecoveredSynced(null);
                    } else {
                        setRecoveredSynced({ data: rec.data, savedAt: rec.savedAt });
                    }
                } else {
                    setRecoveredSynced(null);
                }

                setStatus('idle');

                if (!sweptThisSession) {
                    sweptThisSession = true;
                    void idbSweepExpired(Date.now()).catch(() => undefined);
                }
            })
            .catch(() => {
                if (!cancelled) setStatus('error');
            });
        return () => {
            cancelled = true;
        };
    }, [fullKey, disabled, setRecoveredSynced]);

    // --- flush on key change, before the page can die, or on unmount -----------
    // Declared BEFORE the broadcast-channel effect below: React runs effect
    // cleanups in declaration order, and flush()'s postMessage needs the
    // channel to still be open. If this ran after the channel effect's
    // cleanup (which closes the channel), the final flush on unmount — or on
    // every key change — could never notify other tabs of the write.
    useEffect(() => {
        return () => {
            void flush();
        };
    }, [fullKey, flush]);

    // --- cross-tab conflict channel ---
    useEffect(() => {
        if (disabled || !idbSupported() || typeof BroadcastChannel === 'undefined') return;

        const channel = new BroadcastChannel(fullKey);
        channel.onmessage = (event: MessageEvent) => {
            const msg = event.data as ConflictMessage | undefined;
            if (!msg || typeof msg.tabId !== 'string') return;
            if (msg.tabId === ensureTabId()) {
                regenerateTabId();

                return;
            }
            if (optsRef.current.conflictStrategy === 'first-tab-wins' && !hasWrittenRef.current) {
                persistDisabledRef.current = true;
            }

            optsRef.current.onConflict?.({ otherTabSavedAt: msg.savedAt });
        };

        channelRef.current = channel;

        return () => {
            channelRef.current = null;
            channel.close();
        };
    }, [fullKey, disabled]);

    // --- debounced persistence on value change ---
    useEffect(() => {
        if (
            disabled ||
            !idbSupported() ||
            stoppedRef.current ||
            persistDisabledRef.current ||
            recoveredRef.current
        ) {
            return;
        }

        if (firstRunRef.current) {
            firstRunRef.current = false;
            prevValueRef.current = value;

            return;
        }
        if (Object.is(prevValueRef.current, value)) return;

        prevValueRef.current = value;

        const opts = optsRef.current;
        pendingRef.current = {
            fullKey,
            value,
            exclude: opts.exclude ?? [],
            ttlMs: opts.ttlMs ?? DEFAULT_TTL_MS,
            version: opts.version ?? 1,
            debugKey: opts.key,
        };
        cancelTimer();
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            void flush();
        }, opts.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    }, [value, disabled, fullKey, flush, cancelTimer]);

    useEffect(() => {
        if (disabled || !idbSupported()) return;

        const onHide = () => {
            if (document.visibilityState === 'hidden') void flush();
        };
        const onPageHide = () => void flush();
        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('pagehide', onPageHide);

        return () => {
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('pagehide', onPageHide);
        };
    }, [disabled, flush]);

    // --- consumer API ---
    const restore = useCallback((): T | null => {
        const draft = recoveredRef.current;

        if (!draft) return null;

        setRecoveredSynced(null);

        return draft.data;
    }, [setRecoveredSynced]);

    const discard = useCallback(async (): Promise<void> => {
        setRecoveredSynced(null);
        await idbDelete(fullKey).catch(() => undefined);
    }, [fullKey, setRecoveredSynced]);

    const clear = useCallback(async (): Promise<void> => {
        pendingRef.current = null;
        cancelTimer();
        setRecoveredSynced(null);
        setLastSavedAt(null);
        setStatus('idle');
        await idbDelete(fullKey).catch(() => undefined);
    }, [fullKey, cancelTimer, setRecoveredSynced]);

    return { recovered, status, restore, discard, clear, lastSavedAt };
}

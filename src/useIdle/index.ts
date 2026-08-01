import { useCallback, useEffect, useRef, useState } from 'react';

import { buildStoreKey, getActivityStore } from './activityStore';

const MAX_SCHEDULE_MS = 2_147_483_647;

export interface UseIdleOptions {
    events?: readonly string[];
    idleOnHidden?: boolean;
    syncAcrossTabs?: boolean;
    enabled?: boolean;
    onIdle?: () => void;
    onActive?: () => void;
}

export interface UseIdleReturn {
    isIdle: boolean;
    reset: () => void;
    getLastActive: () => number;
}

/**
 * Reports whether the user has stopped interacting with the page for
 * `timeoutMs` — for session timeouts, "are you still there?" prompts, and
 * pausing expensive work nobody is watching.
 *
 * What the naive `setTimeout` + `mousemove` version gets wrong:
 *
 * - **The timer lies.** A backgrounded tab has its timers clamped, and a
 *   sleeping laptop stops them entirely — so a fired timer proves nothing
 *   about how much time actually passed. Idleness here is always decided by
 *   comparing wall-clock timestamps, and re-checked when the tab becomes
 *   visible again or is restored from bfcache.
 * - **Resetting on every event.** `mousemove` fires ~60-100x/second;
 *   clearing and re-arming a timeout on each one is pure churn. The
 *   timestamp is recorded on every event, but only throttled notifications
 *   reach React.
 * - **`stopPropagation()` hides activity.** Listeners are attached in the
 *   capture phase, so a modal or editor that stops keydown from bubbling
 *   can't make the app think an actively typing user is idle.
 * - **Other tabs count.** With `syncAcrossTabs`, activity in any tab of the
 *   app keeps them all active — no logging someone out of a background tab
 *   while they type in the foreground one.
 *
 * Every instance sharing an event set shares one set of DOM listeners; each
 * keeps its own timeout, so several different thresholds cost one listener.
 */
export function useIdle(timeoutMs: number, options: UseIdleOptions = {}): UseIdleReturn {
    const {
        events,
        idleOnHidden = false,
        syncAcrossTabs = false,
        enabled = true,
        onIdle,
        onActive,
    } = options;

    const store = getActivityStore(buildStoreKey(events, syncAcrossTabs));

    const [isIdle, setIsIdle] = useState(false);

    const onIdleRef = useRef(onIdle);
    onIdleRef.current = onIdle;
    const onActiveRef = useRef(onActive);
    onActiveRef.current = onActive;

    const isIdleRef = useRef(false);

    const setIdleState = useCallback((next: boolean) => {
        if (isIdleRef.current === next) return;

        isIdleRef.current = next;
        setIsIdle(next);

        if (next) onIdleRef.current?.();
        else onActiveRef.current?.();
    }, []);

    useEffect(() => {
        if (!enabled) {
            isIdleRef.current = false;
            setIsIdle(false);

            return;
        }

        let timer: ReturnType<typeof setTimeout> | null = null;
        let cancelled = false;

        const clearTimer = () => {
            if (timer === null) return;

            clearTimeout(timer);
            timer = null;
        };

        const evaluate = () => {
            if (cancelled) return;

            clearTimer();

            if (idleOnHidden && document.visibilityState === 'hidden') {
                setIdleState(true);

                return;
            }

            const remaining = timeoutMs - (Date.now() - store.getLastActivity());

            if (remaining <= 0) {
                setIdleState(true);

                return;
            }

            setIdleState(false);
            timer = setTimeout(evaluate, Math.min(remaining, timeoutMs, MAX_SCHEDULE_MS));
        };

        const unsubscribe = store.subscribe(evaluate);

        document.addEventListener('visibilitychange', evaluate);
        window.addEventListener('pageshow', evaluate);

        evaluate();

        return () => {
            cancelled = true;
            clearTimer();
            unsubscribe();
            document.removeEventListener('visibilitychange', evaluate);
            window.removeEventListener('pageshow', evaluate);
        };
    }, [enabled, timeoutMs, idleOnHidden, store, setIdleState]);

    const reset = useCallback(() => store.markActive(), [store]);
    const getLastActive = useCallback(() => store.getLastActivity(), [store]);

    return { isIdle, reset, getLastActive };
}

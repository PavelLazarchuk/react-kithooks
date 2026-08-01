import { createKeyedCache } from '../internal/keyedCache';
import { createLazyStore } from '../internal/lazyStore';

export type PermissionKind =
    | 'camera'
    | 'microphone'
    | 'geolocation'
    | 'notifications'
    | 'clipboard-read'
    | 'clipboard-write'
    | 'persistent-storage';

export type PermissionStatusEx = 'granted' | 'denied' | 'prompt' | 'unsupported' | 'loading';

interface PermissionStore {
    getSnapshot: () => PermissionStatusEx;
    subscribe: (listener: () => void) => () => void;
    refresh: () => Promise<void>;
    set: (next: PermissionStatusEx) => void;
}

function mapNotificationPermission(p: NotificationPermission): PermissionStatusEx {
    return p === 'default' ? 'prompt' : p;
}

function createStore(kind: PermissionKind): PermissionStore {
    let snapshot: PermissionStatusEx = 'loading';
    let nativeStatus: PermissionStatus | null = null;
    let nativeChangeHandler: (() => void) | null = null;
    let visibilityHandler: (() => void) | null = null;
    let epoch = 0;

    const set = (next: PermissionStatusEx) => {
        if (next === snapshot) return;

        snapshot = next;
        lazyStore.notify();
    };

    const applyFallback = async (startedAt: number): Promise<void> => {
        if (kind === 'notifications' && typeof Notification !== 'undefined') {
            set(mapNotificationPermission(Notification.permission));

            return;
        }

        // Safari has no Permissions API entry for persistent-storage, but it
        // does implement `persisted()` — which answers "is it already
        // persistent?", never "was it refused". So a `false` is an
        // unanswered ask, not a denial.
        if (kind === 'persistent-storage' && navigator.storage?.persisted) {
            try {
                const persisted = await navigator.storage.persisted();

                if (startedAt !== epoch) return;

                set(persisted ? 'granted' : 'prompt');

                return;
            } catch {
                // empty
            }
        }

        if (startedAt !== epoch) return;
        if (snapshot === 'loading') set('unsupported');
    };

    const refresh = async (): Promise<void> => {
        if (typeof navigator === 'undefined') {
            set('unsupported');

            return;
        }
        if (nativeStatus) {
            set(nativeStatus.state);

            return;
        }

        const startedAt = epoch;

        if (!navigator.permissions?.query) {
            await applyFallback(startedAt);

            return;
        }

        try {
            const status = await navigator.permissions.query({ name: kind as PermissionName });

            if (startedAt === epoch && lazyStore.size > 0 && !nativeStatus) {
                nativeStatus = status;
                const onChange = () => set(status.state);
                nativeChangeHandler = onChange;

                if (typeof status.addEventListener === 'function') {
                    status.addEventListener('change', onChange);
                } else {
                    status.onchange = onChange;
                }
            }

            set(status.state);
        } catch {
            await applyFallback(startedAt);
        }
    };

    const detachNativeStatusListener = () => {
        if (!nativeStatus || !nativeChangeHandler) return;
        if (typeof nativeStatus.removeEventListener === 'function') {
            nativeStatus.removeEventListener('change', nativeChangeHandler);
        } else {
            nativeStatus.onchange = null;
        }

        nativeStatus = null;
        nativeChangeHandler = null;
    };

    const attachVisibilityListener = () => {
        if (visibilityHandler || typeof document === 'undefined') return;

        visibilityHandler = () => {
            if (document.visibilityState === 'visible') void refresh();
        };
        document.addEventListener('visibilitychange', visibilityHandler);
    };

    const detachVisibilityListener = () => {
        if (!visibilityHandler || typeof document === 'undefined') return;

        document.removeEventListener('visibilitychange', visibilityHandler);
        visibilityHandler = null;
    };

    const lazyStore = createLazyStore(
        () => {
            epoch += 1;
            attachVisibilityListener();
            void refresh();
        },
        () => {
            epoch += 1;
            detachVisibilityListener();
            detachNativeStatusListener();
        }
    );

    return {
        getSnapshot: () => snapshot,
        subscribe: lazyStore.subscribe,
        refresh,
        set,
    };
}

const stores = createKeyedCache(createStore);

export function getPermissionStore(kind: PermissionKind): PermissionStore {
    return stores.get(kind);
}

export function resetPermissionStores(): void {
    stores.reset();
}

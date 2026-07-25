import { createKeyedCache } from '../internal/keyedCache';
import { createLazyStore } from '../internal/lazyStore';

export type PermissionKind =
    'camera' | 'microphone' | 'geolocation' | 'notifications' | 'clipboard-read';

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

    const set = (next: PermissionStatusEx) => {
        if (next === snapshot) return;

        snapshot = next;
        lazyStore.notify();
    };

    const applyFallback = () => {
        if (kind === 'notifications' && typeof Notification !== 'undefined') {
            set(mapNotificationPermission(Notification.permission));

            return;
        }
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
        if (!navigator.permissions?.query) {
            applyFallback();
            return;
        }

        try {
            const status = await navigator.permissions.query({ name: kind as PermissionName });
            nativeStatus = status;
            const onChange = () => set(status.state);
            nativeChangeHandler = onChange;

            if (typeof status.addEventListener === 'function') {
                status.addEventListener('change', onChange);
            } else {
                status.onchange = onChange;
            }

            set(status.state);
        } catch {
            applyFallback();
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
            void refresh();
            attachVisibilityListener();
        },
        () => {
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

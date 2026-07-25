import { useCallback, useSyncExternalStore } from 'react';

import { getPermissionStore } from './store';
import type { PermissionKind, PermissionStatusEx } from './store';
import { errorName } from '../internal/errorName';

export type { PermissionKind, PermissionStatusEx };

export interface UsePermissionReturn {
    status: PermissionStatusEx;
    isGranted: boolean;
    isDenied: boolean;
    request: () => Promise<PermissionStatusEx>;
}

interface RequestOutcome {
    status: PermissionStatusEx;
    authoritative: boolean;
}

function outcomeFromRequestError(err: unknown): RequestOutcome {
    const name = errorName(err);

    if (name === 'NotAllowedError' || name === 'SecurityError') {
        return { status: 'denied', authoritative: true };
    }

    return { status: 'prompt', authoritative: false };
}

async function requestMedia(kind: 'camera' | 'microphone'): Promise<RequestOutcome> {
    if (!navigator.mediaDevices?.getUserMedia) {
        return { status: 'unsupported', authoritative: false };
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia(
            kind === 'camera' ? { video: true } : { audio: true }
        );

        for (const track of stream.getTracks()) track.stop();

        return { status: 'granted', authoritative: true };
    } catch (err) {
        return outcomeFromRequestError(err);
    }
}

function requestGeolocation(): Promise<RequestOutcome> {
    if (!navigator.geolocation) {
        return Promise.resolve<RequestOutcome>({ status: 'unsupported', authoritative: false });
    }

    return new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(
            () => resolve({ status: 'granted', authoritative: true }),
            err => {
                if (err.code === err.PERMISSION_DENIED) {
                    resolve({ status: 'denied', authoritative: true });
                } else {
                    resolve({ status: 'granted', authoritative: true });
                }
            },
            { timeout: 30_000 }
        );
    });
}

function isNotificationPermission(value: unknown): value is NotificationPermission {
    return value === 'granted' || value === 'denied' || value === 'default';
}

async function requestNotifications(): Promise<RequestOutcome> {
    if (typeof Notification === 'undefined') {
        return { status: 'unsupported', authoritative: false };
    }

    let attempt: unknown;

    try {
        attempt = await Notification.requestPermission();
    } catch {
        attempt = undefined;
    }

    const result: NotificationPermission = isNotificationPermission(attempt)
        ? attempt
        : await new Promise<NotificationPermission>(resolve => {
              Notification.requestPermission(resolve);
          });

    return { status: result === 'default' ? 'prompt' : result, authoritative: true };
}

async function requestClipboardRead(): Promise<RequestOutcome> {
    if (!navigator.clipboard?.readText) {
        return { status: 'unsupported', authoritative: false };
    }

    try {
        await navigator.clipboard.readText();

        return { status: 'granted', authoritative: true };
    } catch (err) {
        return outcomeFromRequestError(err);
    }
}

async function performRequest(kind: PermissionKind): Promise<RequestOutcome> {
    if (typeof navigator === 'undefined') {
        return { status: 'unsupported', authoritative: false };
    }

    switch (kind) {
        case 'camera':
        case 'microphone':
            return requestMedia(kind);
        case 'geolocation':
            return requestGeolocation();
        case 'notifications':
            return requestNotifications();
        case 'clipboard-read':
            return requestClipboardRead();
    }
}

export function usePermission(name: PermissionKind): UsePermissionReturn {
    const store = getPermissionStore(name);

    const status = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        () => 'loading' as const
    );

    const request = useCallback(async (): Promise<PermissionStatusEx> => {
        const outcome = await performRequest(name);

        if (outcome.authoritative) {
            store.set(outcome.status);
        }

        await store.refresh();
        const settled = store.getSnapshot();

        return settled === 'loading' || settled === 'unsupported' ? outcome.status : settled;
    }, [name, store]);

    return {
        status,
        isGranted: status === 'granted',
        isDenied: status === 'denied',
        request,
    };
}

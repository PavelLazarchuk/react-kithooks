import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { usePermission } from './index';
import { resetPermissionStores } from './store';

class FakePermissionStatus extends EventTarget {
    state: PermissionState;
    onchange: (() => void) | null = null;

    constructor(state: PermissionState) {
        super();
        this.state = state;
    }

    setState(next: PermissionState) {
        this.state = next;
        this.dispatchEvent(new Event('change'));
        this.onchange?.();
    }
}

function stubPermissionsQuery(impl: (desc: { name: string }) => Promise<FakePermissionStatus>) {
    const query = vi.fn(impl);
    Object.defineProperty(navigator, 'permissions', {
        value: { query },
        configurable: true,
    });
    return query;
}

const flush = () => act(async () => {});

describe('usePermission', () => {
    beforeEach(() => {
        resetPermissionStores();
    });

    afterEach(() => {
        resetPermissionStores();
        delete (navigator as any).permissions;
        delete (navigator as any).mediaDevices;
        delete (globalThis as any).Notification;
        vi.restoreAllMocks();
    });

    it('starts as loading, then reflects the queried state', async () => {
        const status = new FakePermissionStatus('prompt');
        stubPermissionsQuery(() => Promise.resolve(status));

        const { result } = renderHook(() => usePermission('camera'));
        expect(result.current.status).toBe('loading');

        await flush();
        expect(result.current.status).toBe('prompt');
        expect(result.current.isGranted).toBe(false);
        expect(result.current.isDenied).toBe(false);
    });

    it('updates reactively on permission change events', async () => {
        const status = new FakePermissionStatus('prompt');
        stubPermissionsQuery(() => Promise.resolve(status));

        const { result } = renderHook(() => usePermission('camera'));
        await flush();

        act(() => status.setState('granted'));
        expect(result.current.status).toBe('granted');
        expect(result.current.isGranted).toBe(true);

        act(() => status.setState('denied'));
        expect(result.current.isDenied).toBe(true);
    });

    it('reports unsupported when query throws (e.g. clipboard-read in Firefox)', async () => {
        stubPermissionsQuery(() => Promise.reject(new TypeError('unsupported name')));

        const { result } = renderHook(() => usePermission('clipboard-read'));
        await flush();
        expect(result.current.status).toBe('unsupported');
    });

    it('falls back to Notification.permission when the Permissions API is missing', async () => {
        (globalThis as any).Notification = { permission: 'denied' };

        const { result } = renderHook(() => usePermission('notifications'));
        await flush();
        expect(result.current.status).toBe('denied');
    });

    it('shares one query across multiple hook instances', async () => {
        const status = new FakePermissionStatus('granted');
        const query = stubPermissionsQuery(() => Promise.resolve(status));

        const a = renderHook(() => usePermission('geolocation'));
        const b = renderHook(() => usePermission('geolocation'));
        await flush();

        expect(a.result.current.status).toBe('granted');
        expect(b.result.current.status).toBe('granted');
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('detaches the visibilitychange listener once every subscriber unmounts', async () => {
        const status = new FakePermissionStatus('prompt');
        const query = stubPermissionsQuery(() => Promise.resolve(status));

        const { unmount } = renderHook(() => usePermission('camera'));
        await flush();
        expect(query).toHaveBeenCalledTimes(1);

        unmount();

        Object.defineProperty(document, 'visibilityState', {
            value: 'visible',
            configurable: true,
        });
        try {
            document.dispatchEvent(new Event('visibilitychange'));
            await flush();
            expect(query).toHaveBeenCalledTimes(1);
        } finally {
            delete (document as any).visibilityState;
        }
    });

    it('request(camera) stops all tracks after a successful probe', async () => {
        const status = new FakePermissionStatus('prompt');
        stubPermissionsQuery(() => Promise.resolve(status));
        const stop = vi.fn();
        Object.defineProperty(navigator, 'mediaDevices', {
            value: {
                getUserMedia: vi.fn().mockImplementation(async () => {
                    status.state = 'granted';
                    return { getTracks: () => [{ stop }, { stop }] };
                }),
            },
            configurable: true,
        });

        const { result } = renderHook(() => usePermission('camera'));
        await flush();

        let outcome: string | undefined;
        await act(async () => {
            outcome = await result.current.request();
        });
        expect(outcome).toBe('granted');
        expect(stop).toHaveBeenCalledTimes(2);
        expect(result.current.status).toBe('granted');
    });

    it('request maps NotAllowedError to denied', async () => {
        stubPermissionsQuery(() => Promise.reject(new TypeError('nope')));
        const err = new DOMException('denied', 'NotAllowedError');
        Object.defineProperty(navigator, 'mediaDevices', {
            value: { getUserMedia: vi.fn().mockRejectedValue(err) },
            configurable: true,
        });

        const { result } = renderHook(() => usePermission('microphone'));
        await flush();

        let outcome: string | undefined;
        await act(async () => {
            outcome = await result.current.request();
        });
        expect(outcome).toBe('denied');
        expect(result.current.isDenied).toBe(true);
    });

    it('does not treat a missing device (NotFoundError) as a denial', async () => {
        const status = new FakePermissionStatus('prompt');
        stubPermissionsQuery(() => Promise.resolve(status));
        const err = new DOMException('no camera', 'NotFoundError');
        Object.defineProperty(navigator, 'mediaDevices', {
            value: { getUserMedia: vi.fn().mockRejectedValue(err) },
            configurable: true,
        });

        const { result } = renderHook(() => usePermission('camera'));
        await flush();

        await act(async () => {
            await result.current.request();
        });
        expect(result.current.status).toBe('prompt');
        expect(result.current.isDenied).toBe(false);
    });

    it('request(notifications) works without the Permissions API', async () => {
        (globalThis as any).Notification = {
            permission: 'default',
            requestPermission: vi.fn().mockImplementation(async () => {
                (globalThis as any).Notification.permission = 'granted';
                return 'granted';
            }),
        };

        const { result } = renderHook(() => usePermission('notifications'));
        await flush();
        expect(result.current.status).toBe('prompt');

        let outcome: string | undefined;
        await act(async () => {
            outcome = await result.current.request();
        });
        expect(outcome).toBe('granted');
        expect(result.current.status).toBe('granted');
    });
});

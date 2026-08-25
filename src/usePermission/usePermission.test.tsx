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

    it('a slower query resolving after a newer one does not revert the newer result', async () => {
        const statusA = new FakePermissionStatus('prompt');
        const statusB = new FakePermissionStatus('granted');
        const resolvers: Array<(s: FakePermissionStatus) => void> = [];
        const query = vi.fn(
            () =>
                new Promise<FakePermissionStatus>(resolve => {
                    resolvers.push(resolve);
                })
        );
        Object.defineProperty(navigator, 'permissions', { value: { query }, configurable: true });

        const { result } = renderHook(() => usePermission('camera'));

        Object.defineProperty(document, 'visibilityState', {
            value: 'visible',
            configurable: true,
        });
        try {
            act(() => {
                document.dispatchEvent(new Event('visibilitychange'));
            });

            expect(resolvers.length).toBe(2);

            await act(async () => {
                resolvers[1]!(statusB);
            });
            expect(result.current.status).toBe('granted');

            await act(async () => {
                resolvers[0]!(statusA);
            });
            expect(result.current.status).toBe('granted');
        } finally {
            delete (document as any).visibilityState;
        }
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

    it('does not attach a change listener when the query resolves after the last unmount', async () => {
        const status = new FakePermissionStatus('prompt');
        const add = vi.spyOn(status, 'addEventListener');
        let settle!: (s: FakePermissionStatus) => void;
        stubPermissionsQuery(
            () =>
                new Promise<FakePermissionStatus>(resolve => {
                    settle = resolve;
                })
        );

        const { unmount } = renderHook(() => usePermission('camera'));
        unmount();

        await act(async () => {
            settle(status);
        });

        expect(add).not.toHaveBeenCalled();
    });

    it('attaches exactly one change listener across repeated mount/unmount cycles', async () => {
        const status = new FakePermissionStatus('prompt');
        const add = vi.spyOn(status, 'addEventListener');
        const remove = vi.spyOn(status, 'removeEventListener');
        stubPermissionsQuery(() => Promise.resolve(status));

        for (let i = 0; i < 3; i += 1) {
            const { unmount } = renderHook(() => usePermission('camera'));
            await flush();
            unmount();
        }

        expect(add).toHaveBeenCalledTimes(3);
        expect(remove).toHaveBeenCalledTimes(3);
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

    describe('geolocation request outcomes', () => {
        function stubGeolocation(
            impl: (
                success: PositionCallback,
                error: (err: { code: number; PERMISSION_DENIED: number }) => void
            ) => void
        ) {
            Object.defineProperty(navigator, 'geolocation', {
                value: { getCurrentPosition: vi.fn(impl) },
                configurable: true,
            });
        }

        afterEach(() => {
            delete (navigator as any).geolocation;
        });

        it('treats a fix as an authoritative grant', async () => {
            stubPermissionsQuery(() => Promise.reject(new TypeError('unsupported')));
            stubGeolocation(success => success({} as GeolocationPosition));

            const { result } = renderHook(() => usePermission('geolocation'));
            await flush();

            let outcome: string | undefined;
            await act(async () => {
                outcome = await result.current.request();
            });

            expect(outcome).toBe('granted');
            expect(result.current.status).toBe('granted');
        });

        it('treats PERMISSION_DENIED as an authoritative denial', async () => {
            stubPermissionsQuery(() => Promise.reject(new TypeError('unsupported')));
            stubGeolocation((_success, error) => error({ code: 1, PERMISSION_DENIED: 1 }));

            const { result } = renderHook(() => usePermission('geolocation'));
            await flush();

            let outcome: string | undefined;
            await act(async () => {
                outcome = await result.current.request();
            });

            expect(outcome).toBe('denied');
            expect(result.current.isDenied).toBe(true);
        });

        it('does not report a grant when the request merely timed out', async () => {
            stubPermissionsQuery(() => Promise.reject(new TypeError('unsupported')));
            stubGeolocation((_success, error) => error({ code: 3, PERMISSION_DENIED: 1 }));

            const { result } = renderHook(() => usePermission('geolocation'));
            await flush();

            let outcome: string | undefined;
            await act(async () => {
                outcome = await result.current.request();
            });

            expect(outcome).toBe('prompt');
            expect(result.current.isGranted).toBe(false);
        });

        it('lets the Permissions API decide after a non-denial error', async () => {
            const status = new FakePermissionStatus('prompt');
            stubPermissionsQuery(() => Promise.resolve(status));
            stubGeolocation((_success, error) => error({ code: 2, PERMISSION_DENIED: 1 }));

            const { result } = renderHook(() => usePermission('geolocation'));
            await flush();

            let outcome: string | undefined;
            await act(async () => {
                outcome = await result.current.request();
            });

            expect(outcome).toBe('prompt');
            expect(result.current.status).toBe('prompt');
        });
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

    describe('persistent-storage', () => {
        function stubStorage(storage: Partial<StorageManager>) {
            Object.defineProperty(navigator, 'storage', {
                value: storage,
                configurable: true,
            });
        }

        afterEach(() => {
            delete (navigator as any).storage;
        });

        it('grants via navigator.storage.persist()', async () => {
            const status = new FakePermissionStatus('prompt');
            stubPermissionsQuery(() => Promise.resolve(status));
            const persist = vi.fn().mockResolvedValue(true);
            stubStorage({ persist });

            const { result } = renderHook(() => usePermission('persistent-storage'));
            await flush();

            await act(async () => {
                status.setState('granted');
                await result.current.request();
            });

            expect(persist).toHaveBeenCalledTimes(1);
            expect(result.current.status).toBe('granted');
        });

        it('treats a refused persist() as still promptable, not denied', async () => {
            const status = new FakePermissionStatus('prompt');
            stubPermissionsQuery(() => Promise.resolve(status));
            stubStorage({ persist: vi.fn().mockResolvedValue(false) });

            const { result } = renderHook(() => usePermission('persistent-storage'));
            await flush();

            let outcome: string | undefined;
            await act(async () => {
                outcome = await result.current.request();
            });

            expect(outcome).toBe('prompt');
            expect(result.current.isDenied).toBe(false);
        });

        it('falls back to persisted() where the Permissions API has no entry', async () => {
            stubPermissionsQuery(() => Promise.reject(new TypeError('unknown permission name')));
            stubStorage({ persisted: vi.fn().mockResolvedValue(true) });

            const { result } = renderHook(() => usePermission('persistent-storage'));
            await flush();

            expect(result.current.status).toBe('granted');
        });

        it('reports a not-yet-persistent bucket as prompt, not denied', async () => {
            stubPermissionsQuery(() => Promise.reject(new TypeError('unknown permission name')));
            stubStorage({ persisted: vi.fn().mockResolvedValue(false) });

            const { result } = renderHook(() => usePermission('persistent-storage'));
            await flush();

            expect(result.current.status).toBe('prompt');
            expect(result.current.isDenied).toBe(false);
        });

        it('is unsupported where the Storage API is missing entirely', async () => {
            stubPermissionsQuery(() => Promise.reject(new TypeError('unknown permission name')));

            const { result } = renderHook(() => usePermission('persistent-storage'));
            await flush();

            expect(result.current.status).toBe('unsupported');
        });
    });

    describe('clipboard-write', () => {
        afterEach(() => {
            delete (navigator as any).clipboard;
        });

        it('never writes to the clipboard just to answer a status question', async () => {
            const status = new FakePermissionStatus('granted');
            stubPermissionsQuery(() => Promise.resolve(status));
            const writeText = vi.fn();
            Object.defineProperty(navigator, 'clipboard', {
                value: { writeText },
                configurable: true,
            });

            const { result } = renderHook(() => usePermission('clipboard-write'));
            await flush();

            let outcome: string | undefined;
            await act(async () => {
                outcome = await result.current.request();
            });

            expect(writeText).not.toHaveBeenCalled();
            expect(outcome).toBe('granted');
        });

        it('is unsupported where the Clipboard API is missing', async () => {
            stubPermissionsQuery(() => Promise.reject(new TypeError('unknown permission name')));

            const { result } = renderHook(() => usePermission('clipboard-write'));
            await flush();

            let outcome: string | undefined;
            await act(async () => {
                outcome = await result.current.request();
            });

            expect(outcome).toBe('unsupported');
        });
    });
});

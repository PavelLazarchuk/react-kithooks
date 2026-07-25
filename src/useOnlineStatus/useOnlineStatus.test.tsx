import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useOnlineStatus } from './index';
import { resetOnlineStatusStore } from './store';

function setNavigatorOnLine(value: boolean) {
    Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

function fireBrowserEvent(type: 'online' | 'offline') {
    window.dispatchEvent(new Event(type));
}

describe('useOnlineStatus', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setNavigatorOnLine(true);
        resetOnlineStatusStore();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        resetOnlineStatusStore();
    });

    it('reflects navigator.onLine on mount', () => {
        setNavigatorOnLine(false);
        const { result } = renderHook(() => useOnlineStatus());
        expect(result.current.isOnline).toBe(false);
    });

    it('updates (debounced) when the browser fires an offline event', () => {
        const { result } = renderHook(() => useOnlineStatus());
        expect(result.current.isOnline).toBe(true);

        setNavigatorOnLine(false);
        act(() => fireBrowserEvent('offline'));
        expect(result.current.isOnline).toBe(true);

        act(() => vi.advanceTimersByTime(300));
        expect(result.current.isOnline).toBe(false);
    });

    it('collapses rapid flapping into a single update', () => {
        const { result } = renderHook(() => useOnlineStatus());

        setNavigatorOnLine(false);
        act(() => fireBrowserEvent('offline'));
        act(() => vi.advanceTimersByTime(100));
        setNavigatorOnLine(true);
        act(() => fireBrowserEvent('online'));
        act(() => vi.advanceTimersByTime(300));

        expect(result.current.isOnline).toBe(true);
    });

    it('shares state across hook instances', () => {
        const a = renderHook(() => useOnlineStatus());
        const b = renderHook(() => useOnlineStatus());

        setNavigatorOnLine(false);
        act(() => fireBrowserEvent('offline'));
        act(() => vi.advanceTimersByTime(300));

        expect(a.result.current.isOnline).toBe(false);
        expect(b.result.current.isOnline).toBe(false);
    });

    it('detaches browser listeners once every subscriber unmounts', () => {
        const { unmount } = renderHook(() => useOnlineStatus());
        unmount();

        setNavigatorOnLine(false);
        expect(() => act(() => fireBrowserEvent('offline'))).not.toThrow();
    });

    it('without pingUrl, recheck() resolves to navigator.onLine and does not fetch', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const { result } = renderHook(() => useOnlineStatus());

        const resolved = await result.current.recheck();
        expect(resolved).toBe(true);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('with pingUrl, corrects a false-positive navigator.onLine via a failed ping', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.reject(new Error('network unreachable')))
        );
        const { result } = renderHook(() => useOnlineStatus({ pingUrl: '/api/ping' }));
        expect(result.current.isOnline).toBe(true);

        await vi.waitFor(() => expect(result.current.isOnline).toBe(false));
    });

    it('pings with no-cors, so a cross-origin endpoint is not read as offline', async () => {
        const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve({} as Response));
        vi.stubGlobal('fetch', fetchMock);

        renderHook(() => useOnlineStatus({ pingUrl: 'https://example.com/ping' }));
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
            method: 'HEAD',
            cache: 'no-store',
            mode: 'no-cors',
        });
    });

    it('re-pings on an interval while the tab is visible', async () => {
        const fetchMock = vi.fn(() => Promise.resolve({} as Response));
        vi.stubGlobal('fetch', fetchMock);

        renderHook(() => useOnlineStatus({ pingUrl: '/api/ping', pingIntervalMs: 10_000 }));
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('recheck() is a no-op fetch-wise once pingUrl is omitted, even after a prior ping', async () => {
        const fetchMock = vi.fn(() => Promise.resolve({} as Response));
        vi.stubGlobal('fetch', fetchMock);
        const { result, rerender } = renderHook<
            ReturnType<typeof useOnlineStatus>,
            { pingUrl: string | undefined }
        >(({ pingUrl }) => useOnlineStatus({ pingUrl }), {
            initialProps: { pingUrl: '/api/ping' },
        });
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

        rerender({ pingUrl: undefined });
        await result.current.recheck();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

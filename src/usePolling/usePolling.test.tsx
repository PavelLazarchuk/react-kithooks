import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { resetOnlineStatusStore } from '../internal/onlineStatusStore';
import { usePolling } from './index';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

async function tick(ms = 0) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

function setHidden(hidden: boolean) {
    Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
    Object.defineProperty(document, 'visibilityState', {
        value: hidden ? 'hidden' : 'visible',
        configurable: true,
    });
}

async function setVisibility(hidden: boolean) {
    setHidden(hidden);
    await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(0);
    });
}

async function setOnline(online: boolean) {
    Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
    await act(async () => {
        window.dispatchEvent(new Event(online ? 'online' : 'offline'));
        await vi.advanceTimersByTimeAsync(300);
    });
}

describe('usePolling', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setHidden(false);
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        resetOnlineStatusStore();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        resetOnlineStatusStore();
    });

    it('polls on mount and again on every interval', async () => {
        const poller = vi.fn(async () => 'value');
        const { result } = renderHook(() => usePolling(poller, [], { intervalMs: 1000 }));

        await tick();
        expect(poller).toHaveBeenCalledTimes(1);
        expect(result.current.status).toBe('success');
        expect(result.current.data).toBe('value');

        await tick(1000);
        expect(poller).toHaveBeenCalledTimes(2);

        await tick(1000);
        expect(poller).toHaveBeenCalledTimes(3);
    });

    it('never starts a tick while the previous one is still in flight', async () => {
        const gates: ReturnType<typeof deferred<string>>[] = [];
        const poller = vi.fn(() => {
            const gate = deferred<string>();
            gates.push(gate);
            return gate.promise;
        });

        renderHook(() => usePolling(poller, [], { intervalMs: 1000 }));
        await tick();
        expect(poller).toHaveBeenCalledTimes(1);

        await tick(5000);
        expect(poller).toHaveBeenCalledTimes(1);

        await act(async () => {
            gates[0]?.resolve('first');
        });
        expect(poller).toHaveBeenCalledTimes(1);

        await tick(1000);
        expect(poller).toHaveBeenCalledTimes(2);
    });

    it('stops polling while the tab is hidden and refreshes when it comes back', async () => {
        const poller = vi.fn(async () => 'value');
        const { result } = renderHook(() => usePolling(poller, [], { intervalMs: 1000 }));

        await tick();
        expect(poller).toHaveBeenCalledTimes(1);

        await setVisibility(true);
        expect(result.current.isPaused).toBe(true);

        await tick(10_000);
        expect(poller).toHaveBeenCalledTimes(1);

        await setVisibility(false);
        expect(result.current.isPaused).toBe(false);
        expect(poller).toHaveBeenCalledTimes(2);
    });

    it('does not re-poll on a tab switch shorter than the interval', async () => {
        const poller = vi.fn(async () => 'value');
        renderHook(() => usePolling(poller, [], { intervalMs: 10_000 }));

        await tick();
        expect(poller).toHaveBeenCalledTimes(1);

        await setVisibility(true);
        await tick(1000);
        await setVisibility(false);

        expect(poller).toHaveBeenCalledTimes(1);

        await tick(9000);
        expect(poller).toHaveBeenCalledTimes(2);
    });

    it('stops polling while offline and resumes on reconnect', async () => {
        const poller = vi.fn(async () => 'value');
        const { result } = renderHook(() => usePolling(poller, [], { intervalMs: 1000 }));

        await tick();
        expect(poller).toHaveBeenCalledTimes(1);

        await setOnline(false);
        expect(result.current.isPaused).toBe(true);

        await tick(10_000);
        expect(poller).toHaveBeenCalledTimes(1);

        await setOnline(true);
        expect(result.current.isPaused).toBe(false);
        expect(poller).toHaveBeenCalledTimes(2);
    });

    it('backs off exponentially while the endpoint keeps failing', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(1);
        const poller = vi.fn(async () => {
            throw new Error('down');
        });
        const { result } = renderHook(() => usePolling(poller, [], { intervalMs: 1000 }));

        await tick();
        expect(result.current.status).toBe('error');
        expect(result.current.failureCount).toBe(1);

        await tick(1000);
        expect(poller).toHaveBeenCalledTimes(1);

        await tick(1000);
        expect(poller).toHaveBeenCalledTimes(2);
        expect(result.current.failureCount).toBe(2);

        await tick(3000);
        expect(poller).toHaveBeenCalledTimes(2);

        await tick(1000);
        expect(poller).toHaveBeenCalledTimes(3);
    });

    it('never backs off past maxBackoffMs', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(1);
        let attempts = 0;
        const poller = vi.fn(async () => {
            attempts += 1;
            throw new Error('down');
        });
        renderHook(() => usePolling(poller, [], { intervalMs: 1000, maxBackoffMs: 2000 }));

        await tick();
        for (let i = 0; i < 5; i += 1) await tick(2000);

        expect(attempts).toBe(6);
    });

    it('returns to the plain interval after a success', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(1);
        const poller = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(new Error('down'))
            .mockResolvedValue('value');
        const { result } = renderHook(() => usePolling(poller, [], { intervalMs: 1000 }));

        await tick();
        expect(result.current.failureCount).toBe(1);

        await tick(2000);
        expect(poller).toHaveBeenCalledTimes(2);
        expect(result.current.status).toBe('success');
        expect(result.current.failureCount).toBe(0);

        await tick(1000);
        expect(poller).toHaveBeenCalledTimes(3);
    });

    it('keeps the last data when a tick fails', async () => {
        const poller = vi
            .fn<() => Promise<string>>()
            .mockResolvedValueOnce('value')
            .mockRejectedValue(new Error('down'));
        const { result } = renderHook(() => usePolling(poller, [], { intervalMs: 1000 }));

        await tick();
        expect(result.current.data).toBe('value');

        await tick(1000);
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBeInstanceOf(Error);
        expect(result.current.data).toBe('value');
    });

    it('shows a loading state only for the first run, not for background ticks', async () => {
        const gates: ReturnType<typeof deferred<string>>[] = [];
        const poller = vi.fn(() => {
            const gate = deferred<string>();
            gates.push(gate);
            return gate.promise;
        });
        const { result } = renderHook(() => usePolling(poller, [], { intervalMs: 1000 }));

        await tick();
        expect(result.current.status).toBe('loading');
        expect(result.current.isLoading).toBe(true);
        expect(result.current.isFetching).toBe(true);

        await act(async () => {
            gates[0]?.resolve('first');
        });
        await tick(1000);

        expect(result.current.status).toBe('success');
        expect(result.current.isLoading).toBe(false);
        expect(result.current.isFetching).toBe(true);
    });

    it('never polls while disabled, and resumes when enabled', async () => {
        const poller = vi.fn(async () => 'value');
        const { result, rerender } = renderHook(
            ({ enabled }) => usePolling(poller, [], { intervalMs: 1000, enabled }),
            { initialProps: { enabled: false } }
        );

        await tick(10_000);
        expect(poller).not.toHaveBeenCalled();
        expect(result.current.status).toBe('idle');
        expect(result.current.isPaused).toBe(false);

        rerender({ enabled: true });
        await tick();
        expect(poller).toHaveBeenCalledTimes(1);
    });

    it('waits a full interval before the first run when immediate is false', async () => {
        const poller = vi.fn(async () => 'value');
        renderHook(() => usePolling(poller, [], { intervalMs: 1000, immediate: false }));

        await tick();
        expect(poller).not.toHaveBeenCalled();

        await tick(1000);
        expect(poller).toHaveBeenCalledTimes(1);
    });

    it('refresh() polls now and resets the backoff', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(1);
        const poller = vi
            .fn<() => Promise<string>>()
            .mockRejectedValueOnce(new Error('down'))
            .mockResolvedValue('value');
        const { result } = renderHook(() => usePolling(poller, [], { intervalMs: 1000 }));

        await tick();
        expect(result.current.failureCount).toBe(1);

        await act(async () => {
            result.current.refresh();
        });
        expect(poller).toHaveBeenCalledTimes(2);
        expect(result.current.data).toBe('value');

        await tick(1000);
        expect(poller).toHaveBeenCalledTimes(3);
    });

    it('drops the previous resource and its late response when deps change', async () => {
        const first = deferred<string>();
        const second = deferred<string>();
        const poller = vi
            .fn<() => Promise<string>>()
            .mockReturnValueOnce(first.promise)
            .mockReturnValueOnce(second.promise);

        const { result, rerender } = renderHook(
            ({ id }) => usePolling(poller, [id], { intervalMs: 1000 }),
            { initialProps: { id: 1 } }
        );
        await tick();

        rerender({ id: 2 });
        expect(result.current.data).toBeUndefined();
        expect(result.current.status).toBe('loading');

        await act(async () => {
            first.resolve('first');
        });
        expect(result.current.data).toBeUndefined();

        await act(async () => {
            second.resolve('second');
        });
        expect(result.current.data).toBe('second');
    });

    it('aborts the in-flight request on unmount', async () => {
        const abortSpy = vi.fn();
        const poller = vi.fn((signal: AbortSignal) => {
            signal.addEventListener('abort', abortSpy);
            return new Promise<string>(() => undefined);
        });

        const { unmount } = renderHook(() => usePolling(poller, [], { intervalMs: 1000 }));
        await tick();

        unmount();
        expect(abortSpy).toHaveBeenCalledTimes(1);

        await tick(10_000);
        expect(poller).toHaveBeenCalledTimes(1);
    });

    it('names the hook when the deps array changes length', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const poller = vi.fn(async () => 'value');

        const { rerender } = renderHook(
            ({ deps }: { deps: unknown[] }) => usePolling(poller, deps, { intervalMs: 1000 }),
            { initialProps: { deps: ['a'] as unknown[] } }
        );
        expect(warn).not.toHaveBeenCalled();

        rerender({ deps: ['a', 'b'] });

        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toContain('usePolling');
    });
});

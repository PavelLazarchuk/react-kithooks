import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useIdle } from './index';
import { resetActivityStoresForTests } from './activityStore';

function fireActivity(type = 'keydown') {
    window.dispatchEvent(new Event(type, { bubbles: true }));
}

function setVisibility(state: 'visible' | 'hidden') {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

describe('useIdle', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
        setVisibility('visible');
        resetActivityStoresForTests();
    });

    afterEach(() => {
        vi.useRealTimers();
        resetActivityStoresForTests();
    });

    it('starts active and goes idle once the timeout elapses', async () => {
        const { result } = renderHook(() => useIdle(10_000));

        expect(result.current.isIdle).toBe(false);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });

        expect(result.current.isIdle).toBe(true);
    });

    it('stays active while the user keeps interacting', async () => {
        const { result } = renderHook(() => useIdle(10_000));

        for (let i = 0; i < 3; i += 1) {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(6_000);
            });
            act(() => fireActivity());
        }

        expect(result.current.isIdle).toBe(false);
    });

    it('comes back to active on the next interaction', async () => {
        const { result } = renderHook(() => useIdle(10_000));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(result.current.isIdle).toBe(true);

        act(() => fireActivity());
        expect(result.current.isIdle).toBe(false);
    });

    it('fires onIdle and onActive once per transition, not per event', async () => {
        const onIdle = vi.fn();
        const onActive = vi.fn();

        renderHook(() => useIdle(10_000, { onIdle, onActive }));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(onIdle).toHaveBeenCalledTimes(1);
        expect(onActive).not.toHaveBeenCalled();

        act(() => {
            fireActivity();
            fireActivity();
            fireActivity();
        });
        expect(onActive).toHaveBeenCalledTimes(1);
        expect(onIdle).toHaveBeenCalledTimes(1);
    });

    it('records activity that lands inside the notification throttle window', async () => {
        const { result } = renderHook(() => useIdle(10_000));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5_000);
        });
        act(() => fireActivity());

        await act(async () => {
            await vi.advanceTimersByTimeAsync(100);
        });
        act(() => fireActivity());

        await act(async () => {
            await vi.advanceTimersByTimeAsync(9_999);
        });
        expect(result.current.isIdle).toBe(false);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(result.current.isIdle).toBe(true);
    });

    it('sees activity a component stopped from propagating', async () => {
        const { result } = renderHook(() => useIdle(10_000));

        const child = document.createElement('div');
        document.body.appendChild(child);
        child.addEventListener('keydown', event => event.stopPropagation());

        await act(async () => {
            await vi.advanceTimersByTimeAsync(9_000);
        });
        act(() => {
            child.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2_000);
        });
        expect(result.current.isIdle).toBe(false);

        child.remove();
    });

    it('decides on the wall clock, so a slept/throttled tab is idle the moment it is looked at', async () => {
        const { result } = renderHook(() => useIdle(60_000));

        act(() => {
            vi.setSystemTime(Date.now() + 10 * 60_000);
        });
        expect(result.current.isIdle).toBe(false);

        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect(result.current.isIdle).toBe(true);
    });

    it('re-checks on bfcache restore', async () => {
        const { result } = renderHook(() => useIdle(60_000));

        act(() => {
            vi.setSystemTime(Date.now() + 10 * 60_000);
        });
        act(() => {
            window.dispatchEvent(new Event('pageshow'));
        });

        expect(result.current.isIdle).toBe(true);
    });

    it("does not spin when the timeout exceeds setTimeout's 32-bit delay field", async () => {
        const { result } = renderHook(() => useIdle(2 ** 31 + 60_000));

        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5_000);
        });

        expect(setTimeoutSpy.mock.calls.length).toBeLessThan(5);
        expect(result.current.isIdle).toBe(false);

        setTimeoutSpy.mockRestore();
    });

    it('bounds re-checking when the system clock jumps backwards', () => {
        renderHook(() => useIdle(10_000));

        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

        act(() => {
            vi.setSystemTime(Date.now() - 3_600_000);
        });
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        const delays = setTimeoutSpy.mock.calls.map(call => call[1] as number);
        expect(delays.length).toBeGreaterThan(0);
        expect(Math.max(...delays)).toBeLessThanOrEqual(10_000);

        setTimeoutSpy.mockRestore();
    });

    it('reset() marks the user active immediately', async () => {
        const { result } = renderHook(() => useIdle(10_000));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(result.current.isIdle).toBe(true);

        act(() => result.current.reset());
        expect(result.current.isIdle).toBe(false);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(9_999);
        });
        expect(result.current.isIdle).toBe(false);
    });

    it('getLastActive reports the latest activity timestamp', async () => {
        const { result } = renderHook(() => useIdle(10_000));
        const mounted = result.current.getLastActive();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(3_000);
        });
        act(() => fireActivity());

        expect(result.current.getLastActive()).toBe(mounted + 3_000);
    });

    it('with idleOnHidden, a backgrounded tab is idle right away', async () => {
        const { result } = renderHook(() => useIdle(60_000, { idleOnHidden: true }));

        expect(result.current.isIdle).toBe(false);

        act(() => {
            setVisibility('hidden');
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect(result.current.isIdle).toBe(true);

        act(() => {
            setVisibility('visible');
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect(result.current.isIdle).toBe(false);
    });

    it('without idleOnHidden, a backgrounded tab keeps counting down normally', async () => {
        const { result } = renderHook(() => useIdle(60_000));

        act(() => {
            setVisibility('hidden');
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect(result.current.isIdle).toBe(false);
    });

    it('reports active and tracks nothing while disabled', async () => {
        const { result, rerender } = renderHook(
            ({ enabled }: { enabled: boolean }) => useIdle(10_000, { enabled }),
            { initialProps: { enabled: false } }
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(30_000);
        });
        expect(result.current.isIdle).toBe(false);

        rerender({ enabled: true });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(result.current.isIdle).toBe(true);
    });

    it('does not fire onActive when it is merely switched off', async () => {
        const onActive = vi.fn();
        const { rerender } = renderHook(
            ({ enabled }: { enabled: boolean }) => useIdle(10_000, { enabled, onActive }),
            { initialProps: { enabled: true } }
        );

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });

        rerender({ enabled: false });
        expect(onActive).not.toHaveBeenCalled();
    });

    it('shares one activity stream across instances with different timeouts', async () => {
        const short = renderHook(() => useIdle(5_000));
        const long = renderHook(() => useIdle(20_000));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5_000);
        });
        expect(short.result.current.isIdle).toBe(true);
        expect(long.result.current.isIdle).toBe(false);

        act(() => fireActivity());
        expect(short.result.current.isIdle).toBe(false);
        expect(long.result.current.isIdle).toBe(false);
    });

    it('detaches its listeners once every subscriber unmounts', async () => {
        const { unmount } = renderHook(() => useIdle(10_000));
        unmount();

        expect(() => act(() => fireActivity())).not.toThrow();
    });

    it('honours a custom event set, ignoring events outside it', async () => {
        const { result } = renderHook(() => useIdle(10_000, { events: ['keydown'] }));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(9_000);
        });
        act(() => fireActivity('mousemove'));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1_000);
        });
        expect(result.current.isIdle).toBe(true);
    });

    it('shares a store regardless of the event array identity or order', async () => {
        const a = renderHook(() => useIdle(10_000, { events: ['keydown', 'mousedown'] }));
        const b = renderHook(() => useIdle(10_000, { events: ['mousedown', 'keydown'] }));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(9_000);
        });
        act(() => fireActivity('mousedown'));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2_000);
        });
        expect(a.result.current.isIdle).toBe(false);
        expect(b.result.current.isIdle).toBe(false);
    });

    describe('syncAcrossTabs', () => {
        it('keeps another tab active when this one reports interaction', async () => {
            const tabA = renderHook(() => useIdle(10_000, { syncAcrossTabs: true }));

            resetActivityStoresForTests();
            const tabB = renderHook(() => useIdle(10_000, { syncAcrossTabs: true }));

            await act(async () => {
                await vi.advanceTimersByTimeAsync(8_000);
            });

            await act(async () => {
                tabA.result.current.reset();
                await Promise.resolve();
            });

            await act(async () => {
                await vi.advanceTimersByTimeAsync(3_000);
            });

            expect(tabA.result.current.isIdle).toBe(false);
            expect(tabB.result.current.isIdle).toBe(false);
        });

        it('leaves other tabs alone when sync is off', async () => {
            const tabA = renderHook(() => useIdle(10_000));

            resetActivityStoresForTests();
            const tabB = renderHook(() => useIdle(10_000));

            await act(async () => {
                await vi.advanceTimersByTimeAsync(8_000);
            });

            await act(async () => {
                tabA.result.current.reset();
                await Promise.resolve();
            });

            await act(async () => {
                await vi.advanceTimersByTimeAsync(3_000);
            });

            expect(tabA.result.current.isIdle).toBe(false);
            expect(tabB.result.current.isIdle).toBe(true);
        });
    });
});

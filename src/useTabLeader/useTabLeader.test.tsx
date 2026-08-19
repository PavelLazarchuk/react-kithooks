import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useTabLeader } from './index';
import { resetTabLeaderStoresForTests } from './store';

const LOCK_KEY = 'react-kithooks:tab-leader:room';

function withoutWebLocks<T>(fn: () => T): T {
    const original = navigator.locks;
    Object.defineProperty(navigator, 'locks', {
        value: undefined,
        configurable: true,
        writable: true,
    });

    try {
        return fn();
    } finally {
        Object.defineProperty(navigator, 'locks', {
            value: original,
            configurable: true,
            writable: true,
        });
    }
}

function simulateCrossTabWrite(key: string, newValue: string | null) {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage }));
}

describe('useTabLeader', () => {
    beforeEach(() => {
        resetTabLeaderStoresForTests();
    });

    afterEach(() => {
        resetTabLeaderStoresForTests();
    });

    it('elects the only tab as leader, via Web Locks', async () => {
        const { result } = renderHook(() => useTabLeader('room'));

        expect(result.current.status).toBe('pending');
        expect(result.current.isLeader).toBe(false);

        await vi.waitFor(() => expect(result.current.isLeader).toBe(true));
        expect(result.current.mechanism).toBe('locks');
    });

    it('shares one election across multiple instances in the same tab', async () => {
        const a = renderHook(() => useTabLeader('shared'));
        const b = renderHook(() => useTabLeader('shared'));

        await vi.waitFor(() => expect(a.result.current.isLeader).toBe(true));
        expect(b.result.current.isLeader).toBe(true);
    });

    it('does not let unrelated keys contend with each other', async () => {
        const a = renderHook(() => useTabLeader('room-a'));
        const b = renderHook(() => useTabLeader('room-b'));

        await vi.waitFor(() => expect(a.result.current.isLeader).toBe(true));
        await vi.waitFor(() => expect(b.result.current.isLeader).toBe(true));
    });

    it('queues a second tab behind the first, and promotes it the instant the leader tab closes', async () => {
        const tabA = renderHook(() => useTabLeader('room'));
        await vi.waitFor(() => expect(tabA.result.current.isLeader).toBe(true));

        resetTabLeaderStoresForTests();

        const tabB = renderHook(() => useTabLeader('room'));
        await act(async () => {
            await Promise.resolve();
        });
        expect(tabB.result.current.isLeader).toBe(false);
        expect(tabB.result.current.status).toBe('follower');
        expect(tabB.result.current.mechanism).toBe('locks');

        tabA.unmount();
        await vi.waitFor(() => expect(tabB.result.current.isLeader).toBe(true));
    });

    it('fires onBecomeLeader exactly once on promotion, and never onBecomeFollower for a tab that was never leader', async () => {
        const onBecomeLeader = vi.fn();
        const onBecomeFollower = vi.fn();

        const tabA = renderHook(() => useTabLeader('room'));
        await vi.waitFor(() => expect(tabA.result.current.isLeader).toBe(true));

        resetTabLeaderStoresForTests();
        renderHook(() => useTabLeader('room', { onBecomeLeader, onBecomeFollower }));
        await act(async () => {
            await Promise.resolve();
        });
        expect(onBecomeLeader).not.toHaveBeenCalled();

        tabA.unmount();
        await vi.waitFor(() => expect(onBecomeLeader).toHaveBeenCalledTimes(1));
        expect(onBecomeFollower).not.toHaveBeenCalled();
    });

    it('settles a queued tab on "follower" rather than leaving it "pending" forever', async () => {
        const tabA = renderHook(() => useTabLeader('room'));
        await vi.waitFor(() => expect(tabA.result.current.isLeader).toBe(true));

        resetTabLeaderStoresForTests();

        const tabB = renderHook(() => useTabLeader('room'));

        await vi.waitFor(() => expect(tabB.result.current.status).toBe('follower'));
        expect(tabB.result.current.isLeader).toBe(false);
        expect(tabB.result.current.mechanism).toBe('locks');
    });

    it('never reports the winning tab as a follower on its way to leadership', async () => {
        const { result } = renderHook(() => useTabLeader('uncontended'));
        const seen: string[] = [];

        await vi.waitFor(() => expect(result.current.isLeader).toBe(true));

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        seen.push(result.current.status);
        expect(seen).toEqual(['leader']);
    });

    it('releases leadership once every instance for the key unmounts', async () => {
        const tabA = renderHook(() => useTabLeader('room'));
        await vi.waitFor(() => expect(tabA.result.current.isLeader).toBe(true));

        tabA.unmount();
        resetTabLeaderStoresForTests();

        const tabB = renderHook(() => useTabLeader('room'));
        await vi.waitFor(() => expect(tabB.result.current.isLeader).toBe(true));
    });

    it('does not leak a granted lock when unmount races ahead of the grant, orphaning it forever', async () => {
        const { unmount } = renderHook(() => useTabLeader('room'));
        unmount();

        resetTabLeaderStoresForTests();
        const { result } = renderHook(() => useTabLeader('room'));
        await vi.waitFor(() => expect(result.current.isLeader).toBe(true));
    });

    it('does not fire onBecomeFollower on a key change — only on an actual loss of leadership', async () => {
        const onBecomeFollower = vi.fn();

        const { result, rerender } = renderHook<ReturnType<typeof useTabLeader>, { key: string }>(
            ({ key }) => useTabLeader(key, { onBecomeFollower }),
            { initialProps: { key: 'room-x' } }
        );
        await vi.waitFor(() => expect(result.current.isLeader).toBe(true));

        rerender({ key: 'room-y' });
        await act(async () => {
            await Promise.resolve();
        });

        expect(onBecomeFollower).not.toHaveBeenCalled();
    });

    describe('storage fallback (no Web Locks)', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            localStorage.clear();
        });

        afterEach(() => {
            vi.useRealTimers();
            localStorage.clear();
        });

        it('elects a leader over localStorage when Web Locks is unavailable', async () => {
            const { result } = withoutWebLocks(() => renderHook(() => useTabLeader('room')));

            expect(result.current.status).toBe('pending');

            await act(async () => {
                await vi.advanceTimersByTimeAsync(300);
            });

            expect(result.current.isLeader).toBe(true);
            expect(result.current.mechanism).toBe('storage');
        });

        it('keeps a second tab a follower while the first tab is alive', async () => {
            const tabA = withoutWebLocks(() => renderHook(() => useTabLeader('room')));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(300);
            });
            expect(tabA.result.current.isLeader).toBe(true);

            resetTabLeaderStoresForTests();
            const tabB = withoutWebLocks(() => renderHook(() => useTabLeader('room')));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(300);
            });

            expect(tabB.result.current.status).toBe('follower');
        });

        it('promotes the follower once a cross-tab notification reports the leader gone', async () => {
            const tabA = withoutWebLocks(() => renderHook(() => useTabLeader('room')));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(300);
            });

            resetTabLeaderStoresForTests();
            const tabB = withoutWebLocks(() => renderHook(() => useTabLeader('room')));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(300);
            });
            expect(tabB.result.current.status).toBe('follower');

            tabA.unmount();
            expect(localStorage.getItem(LOCK_KEY)).toBeNull();

            act(() => simulateCrossTabWrite(LOCK_KEY, null));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(300);
            });

            expect(tabB.result.current.isLeader).toBe(true);
        });

        it('releases the record on pagehide, for a close React never gets to run an unmount for', async () => {
            const { result } = withoutWebLocks(() => renderHook(() => useTabLeader('room')));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(300);
            });
            expect(result.current.isLeader).toBe(true);

            act(() => window.dispatchEvent(new Event('pagehide')));
            expect(localStorage.getItem(LOCK_KEY)).toBeNull();
        });

        it('does not leave a dangling claim when unmount races ahead of the settle confirmation', async () => {
            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

            const tabA = withoutWebLocks(() => renderHook(() => useTabLeader('room')));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(10);
            });
            expect(localStorage.getItem(LOCK_KEY)).not.toBeNull();
            expect(tabA.result.current.status).toBe('pending');

            tabA.unmount();

            expect(localStorage.getItem(LOCK_KEY)).toBeNull();

            randomSpy.mockRestore();
        });

        it('does not self-demote while re-observing its own still-settling claim', async () => {
            const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

            const { result } = withoutWebLocks(() => renderHook(() => useTabLeader('room')));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(10);
            });
            const ownRecord = localStorage.getItem(LOCK_KEY);

            act(() => simulateCrossTabWrite(LOCK_KEY, ownRecord));

            expect(result.current.status).not.toBe('follower');

            randomSpy.mockRestore();
        });

        it('detects a leader that vanished without releasing, once its heartbeat goes stale', async () => {
            localStorage.setItem(LOCK_KEY, JSON.stringify({ id: 'ghost-tab', ts: Date.now() }));

            const { result } = withoutWebLocks(() => renderHook(() => useTabLeader('room')));
            await act(async () => {
                await vi.advanceTimersByTimeAsync(300);
            });
            expect(result.current.status).toBe('follower');

            await act(async () => {
                await vi.advanceTimersByTimeAsync(6_000);
            });
            expect(result.current.isLeader).toBe(true);
        });
    });
});

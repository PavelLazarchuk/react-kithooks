import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useLocalStorage } from './index';
import { resetStorageStores } from './store';

function simulateCrossTabWrite(key: string | null, newValue: string | null) {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage }));
}

describe('useLocalStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        resetStorageStores();
    });

    afterEach(() => {
        localStorage.clear();
        resetStorageStores();
    });

    it('returns the initial value when the key is absent', () => {
        const { result } = renderHook(() => useLocalStorage('count', 0));
        expect(result.current[0]).toBe(0);
    });

    it('reads a pre-existing value from storage on mount', () => {
        localStorage.setItem('count', JSON.stringify(42));
        const { result } = renderHook(() => useLocalStorage('count', 0));
        expect(result.current[0]).toBe(42);
    });

    it('does not write the initial value into storage on mount', () => {
        renderHook(() => useLocalStorage('count', 0));
        expect(localStorage.getItem('count')).toBeNull();
    });

    it('setValue persists to storage and updates the returned value', () => {
        const { result } = renderHook(() => useLocalStorage('count', 0));

        act(() => result.current[1](5));
        expect(result.current[0]).toBe(5);
        expect(localStorage.getItem('count')).toBe('5');
    });

    it('setValue accepts a functional updater', () => {
        const { result } = renderHook(() => useLocalStorage('count', 0));

        act(() => result.current[1](prev => prev + 1));
        act(() => result.current[1](prev => prev + 1));
        expect(result.current[0]).toBe(2);
    });

    it('removeValue clears storage and reverts to the initial value', () => {
        const { result } = renderHook(() => useLocalStorage('count', 0));

        act(() => result.current[1](5));
        act(() => result.current[2]());
        expect(result.current[0]).toBe(0);
        expect(localStorage.getItem('count')).toBeNull();
    });

    it('syncs two hook instances in the same tab (no native storage event fires here)', () => {
        const a = renderHook(() => useLocalStorage('count', 0));
        const b = renderHook(() => useLocalStorage('count', 0));

        act(() => a.result.current[1](7));
        expect(b.result.current[0]).toBe(7);
    });

    it('reacts to a simulated cross-tab write', () => {
        const { result } = renderHook(() => useLocalStorage('count', 0));

        act(() => simulateCrossTabWrite('count', '9'));
        expect(result.current[0]).toBe(9);
    });

    it('ignores storage events for a different key', () => {
        const { result } = renderHook(() => useLocalStorage('count', 0));

        act(() => simulateCrossTabWrite('other-key', '999'));
        expect(result.current[0]).toBe(0);
    });

    it('resets to the initial value when another tab calls localStorage.clear()', () => {
        localStorage.setItem('count', JSON.stringify(5));
        const { result } = renderHook(() => useLocalStorage('count', 0));
        expect(result.current[0]).toBe(5);

        act(() => simulateCrossTabWrite(null, null));
        expect(result.current[0]).toBe(0);
    });

    it('falls back to the initial value when storage holds unparsable JSON', () => {
        localStorage.setItem('count', 'not-json{');
        const { result } = renderHook(() => useLocalStorage('count', 0));
        expect(result.current[0]).toBe(0);
    });

    it('detaches the storage listener once every subscriber unmounts', () => {
        const { unmount } = renderHook(() => useLocalStorage('count', 0));
        unmount();

        expect(() => simulateCrossTabWrite('count', '1')).not.toThrow();
    });

    it('picks up a same-tab write made while nothing was subscribed', () => {
        const first = renderHook(() => useLocalStorage('count', 0));
        act(() => first.result.current[1](1));
        first.unmount();

        localStorage.setItem('count', JSON.stringify(7));

        const second = renderHook(() => useLocalStorage('count', 0));
        expect(second.result.current[0]).toBe(7);
    });

    it('picks up a same-tab write while nothing was subscribed with syncTabs: false', () => {
        const first = renderHook(() => useLocalStorage('count', 0, { syncTabs: false }));
        act(() => first.result.current[1](1));
        first.unmount();

        localStorage.setItem('count', JSON.stringify(7));

        const second = renderHook(() => useLocalStorage('count', 0, { syncTabs: false }));
        expect(second.result.current[0]).toBe(7);
    });

    it('supports custom serialize/deserialize for non-JSON-safe values', () => {
        const options = {
            serialize: (value: Date) => value.toISOString(),
            deserialize: (raw: string) => new Date(raw),
        };
        const initial = new Date('2026-01-01T00:00:00.000Z');
        const { result } = renderHook(() => useLocalStorage('when', initial, options));

        const next = new Date('2026-07-17T00:00:00.000Z');
        act(() => result.current[1](next));
        expect(localStorage.getItem('when')).toBe(next.toISOString());
        expect(result.current[0]).toEqual(next);
    });

    it('does not loop when initialValue is an object/array and the key is absent', () => {
        const { result } = renderHook(() =>
            useLocalStorage('missing-object-key', () => ({ theme: 'dark' }))
        );
        expect(result.current[0]).toEqual({ theme: 'dark' });
    });

    it('re-resolves the initial value when the key changes dynamically', () => {
        const { result, rerender } = renderHook(
            ({ key, init }: { key: string; init: number }) => useLocalStorage(key, init),
            { initialProps: { key: 'dyn-k1', init: 1 } }
        );
        expect(result.current[0]).toBe(1);

        rerender({ key: 'dyn-k2', init: 2 });
        expect(result.current[0]).toBe(2);
    });

    describe('syncTabs: false', () => {
        const isolated = { syncTabs: false };

        it('ignores a cross-tab write', () => {
            const { result } = renderHook(() => useLocalStorage('count', 0, isolated));

            act(() => simulateCrossTabWrite('count', '9'));
            expect(result.current[0]).toBe(0);
        });

        it('ignores another tab calling localStorage.clear()', () => {
            localStorage.setItem('count', JSON.stringify(5));
            const { result } = renderHook(() => useLocalStorage('count', 0, isolated));

            act(() => simulateCrossTabWrite(null, null));
            expect(result.current[0]).toBe(5);
        });

        it('still reads the pre-existing value on mount and still persists writes', () => {
            localStorage.setItem('count', JSON.stringify(5));
            const { result } = renderHook(() => useLocalStorage('count', 0, isolated));
            expect(result.current[0]).toBe(5);

            act(() => result.current[1](6));
            expect(result.current[0]).toBe(6);
            expect(localStorage.getItem('count')).toBe('6');
        });

        it('still syncs instances within this tab', () => {
            const a = renderHook(() => useLocalStorage('count', 0, isolated));
            const b = renderHook(() => useLocalStorage('count', 0, isolated));

            act(() => a.result.current[1](7));
            expect(b.result.current[0]).toBe(7);
        });

        it('does not affect a synced instance sharing the same key', () => {
            const isolatedHook = renderHook(() => useLocalStorage('count', 0, isolated));
            const syncedHook = renderHook(() => useLocalStorage('count', 0));

            act(() => simulateCrossTabWrite('count', '9'));
            expect(syncedHook.result.current[0]).toBe(9);
            expect(isolatedHook.result.current[0]).toBe(0);
        });

        it('a local write wins over the ignored cross-tab value', () => {
            const { result } = renderHook(() => useLocalStorage('count', 0, isolated));

            act(() => simulateCrossTabWrite('count', '9'));
            act(() => result.current[1](1));

            expect(result.current[0]).toBe(1);
            expect(localStorage.getItem('count')).toBe('1');
        });

        it('resolves a functional update against the local value, not the other tab', () => {
            const { result } = renderHook(() => useLocalStorage('count', 0, isolated));

            act(() => result.current[1](1));
            act(() => simulateCrossTabWrite('count', '100'));
            act(() => result.current[1](prev => prev + 1));

            expect(result.current[0]).toBe(2);
        });

        it('keeps setValue identity stable across re-renders', () => {
            const { result, rerender } = renderHook(() =>
                useLocalStorage('count', 0, { syncTabs: false })
            );
            const first = result.current[1];

            rerender();
            act(() => result.current[1](1));

            expect(result.current[1]).toBe(first);
        });

        it('keeps setValue identity stable when serialize/deserialize are inline', () => {
            const { result, rerender } = renderHook(() =>
                useLocalStorage('when', new Date(0), {
                    serialize: (value: Date) => value.toISOString(),
                    deserialize: (raw: string) => new Date(raw),
                })
            );
            const first = result.current[1];

            rerender();
            rerender();

            expect(result.current[1]).toBe(first);
        });

        it('uses the latest serialize even though it is held in a ref', () => {
            const { result, rerender } = renderHook(
                ({ prefix }: { prefix: string }) =>
                    useLocalStorage('tagged', 'a', {
                        serialize: (value: string) => prefix + value,
                        deserialize: (raw: string) => raw,
                    }),
                { initialProps: { prefix: 'v1:' } }
            );

            rerender({ prefix: 'v2:' });
            act(() => result.current[1]('b'));

            expect(localStorage.getItem('tagged')).toBe('v2:b');
        });

        it('re-writing the value another tab already stored still updates this tab', () => {
            const { result } = renderHook(() => useLocalStorage('count', 0, isolated));

            act(() => simulateCrossTabWrite('count', '9'));
            act(() => result.current[1](9));

            expect(result.current[0]).toBe(9);
        });
    });

    describe('when storage is unavailable or full', () => {
        const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;

        function replaceLocalStorage(descriptor: PropertyDescriptor) {
            Object.defineProperty(window, 'localStorage', {
                configurable: true,
                ...descriptor,
            });
            resetStorageStores();
        }

        afterEach(() => {
            Object.defineProperty(window, 'localStorage', original);
            resetStorageStores();
        });

        it('renders instead of throwing when accessing localStorage itself throws', () => {
            replaceLocalStorage({
                get() {
                    throw new DOMException('denied', 'SecurityError');
                },
            });

            const { result } = renderHook(() => useLocalStorage('count', 7));
            expect(result.current[0]).toBe(7);
        });

        it('keeps state in memory when the value cannot be persisted', () => {
            replaceLocalStorage({
                get() {
                    throw new DOMException('denied', 'SecurityError');
                },
            });

            const { result } = renderHook(() => useLocalStorage('count', 0));
            act(() => result.current[1](5));

            expect(result.current[0]).toBe(5);
        });

        it('keeps state in memory when a write exceeds the quota', () => {
            const real = window.localStorage;
            replaceLocalStorage({
                value: {
                    getItem: (key: string) => real.getItem(key),
                    removeItem: (key: string) => real.removeItem(key),
                    setItem: () => {
                        throw new DOMException('full', 'QuotaExceededError');
                    },
                },
            });

            const { result } = renderHook(() => useLocalStorage('count', 0));
            act(() => result.current[1](5));

            expect(result.current[0]).toBe(5);
        });

        it('shares the in-memory value with another instance of the same key', () => {
            replaceLocalStorage({
                get() {
                    throw new DOMException('denied', 'SecurityError');
                },
            });

            const writer = renderHook(() => useLocalStorage('count', 0));
            const reader = renderHook(() => useLocalStorage('count', 0));

            act(() => writer.result.current[1](3));
            expect(reader.result.current[0]).toBe(3);
        });

        it('keeps the memory-only value alive across a remount', async () => {
            replaceLocalStorage({
                get() {
                    throw new DOMException('denied', 'SecurityError');
                },
            });

            const first = renderHook(() => useLocalStorage('count', 0));
            act(() => first.result.current[1](9));
            first.unmount();

            await act(async () => {
                await Promise.resolve();
            });

            const second = renderHook(() => useLocalStorage('count', 0));
            expect(second.result.current[0]).toBe(9);
        });
    });
});

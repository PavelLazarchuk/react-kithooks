import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useSessionStorage } from './index';
import { resetStorageStores } from './store';

function simulateSameTabWrite(key: string | null, newValue: string | null) {
    window.dispatchEvent(
        new StorageEvent('storage', { key, newValue, storageArea: sessionStorage })
    );
}

describe('useSessionStorage', () => {
    beforeEach(() => {
        sessionStorage.clear();
        resetStorageStores();
    });

    afterEach(() => {
        sessionStorage.clear();
        resetStorageStores();
    });

    it('returns the initial value when the key is absent', () => {
        const { result } = renderHook(() => useSessionStorage('count', 0));
        expect(result.current[0]).toBe(0);
    });

    it('reads a pre-existing value from storage on mount', () => {
        sessionStorage.setItem('count', JSON.stringify(42));
        const { result } = renderHook(() => useSessionStorage('count', 0));
        expect(result.current[0]).toBe(42);
    });

    it('does not write the initial value into storage on mount', () => {
        renderHook(() => useSessionStorage('count', 0));
        expect(sessionStorage.getItem('count')).toBeNull();
    });

    it('setValue persists to storage and updates the returned value', () => {
        const { result } = renderHook(() => useSessionStorage('count', 0));

        act(() => result.current[1](5));
        expect(result.current[0]).toBe(5);
        expect(sessionStorage.getItem('count')).toBe('5');
    });

    it('setValue accepts a functional updater', () => {
        const { result } = renderHook(() => useSessionStorage('count', 0));

        act(() => result.current[1](prev => prev + 1));
        act(() => result.current[1](prev => prev + 1));
        expect(result.current[0]).toBe(2);
    });

    it('removeValue clears storage and reverts to the initial value', () => {
        const { result } = renderHook(() => useSessionStorage('count', 0));

        act(() => result.current[1](5));
        act(() => result.current[2]());
        expect(result.current[0]).toBe(0);
        expect(sessionStorage.getItem('count')).toBeNull();
    });

    it('syncs two hook instances in the current tab (no native storage event fires here)', () => {
        const a = renderHook(() => useSessionStorage('count', 0));
        const b = renderHook(() => useSessionStorage('count', 0));

        act(() => a.result.current[1](7));
        expect(b.result.current[0]).toBe(7);
    });

    it('reacts to a simulated storage event on this tab’s session storage area', () => {
        const { result } = renderHook(() => useSessionStorage('count', 0));

        act(() => simulateSameTabWrite('count', '9'));
        expect(result.current[0]).toBe(9);
    });

    it('ignores storage events from a different storage area (e.g. localStorage)', () => {
        const { result } = renderHook(() => useSessionStorage('count', 0));

        act(() => {
            window.dispatchEvent(
                new StorageEvent('storage', {
                    key: 'count',
                    newValue: '999',
                    storageArea: localStorage,
                })
            );
        });
        expect(result.current[0]).toBe(0);
    });

    it('ignores storage events for a different key', () => {
        const { result } = renderHook(() => useSessionStorage('count', 0));

        act(() => simulateSameTabWrite('other-key', '999'));
        expect(result.current[0]).toBe(0);
    });

    it('resets to the initial value when the area is cleared', () => {
        sessionStorage.setItem('count', JSON.stringify(5));
        const { result } = renderHook(() => useSessionStorage('count', 0));
        expect(result.current[0]).toBe(5);

        act(() => simulateSameTabWrite(null, null));
        expect(result.current[0]).toBe(0);
    });

    it('falls back to the initial value when storage holds unparsable JSON', () => {
        sessionStorage.setItem('count', 'not-json{');
        const { result } = renderHook(() => useSessionStorage('count', 0));
        expect(result.current[0]).toBe(0);
    });

    it('detaches the storage listener once every subscriber unmounts', () => {
        const { unmount } = renderHook(() => useSessionStorage('count', 0));
        unmount();

        expect(() => simulateSameTabWrite('count', '1')).not.toThrow();
    });

    it('supports custom serialize/deserialize for non-JSON-safe values', () => {
        const options = {
            serialize: (value: Date) => value.toISOString(),
            deserialize: (raw: string) => new Date(raw),
        };
        const initial = new Date('2026-01-01T00:00:00.000Z');
        const { result } = renderHook(() => useSessionStorage('when', initial, options));

        const next = new Date('2026-07-17T00:00:00.000Z');
        act(() => result.current[1](next));
        expect(sessionStorage.getItem('when')).toBe(next.toISOString());
        expect(result.current[0]).toEqual(next);
    });

    it('does not loop when initialValue is an object/array and the key is absent', () => {
        const { result } = renderHook(() =>
            useSessionStorage('missing-object-key', () => ({ theme: 'dark' }))
        );
        expect(result.current[0]).toEqual({ theme: 'dark' });
    });

    it('re-resolves the initial value when the key changes dynamically', () => {
        const { result, rerender } = renderHook(
            ({ key, init }: { key: string; init: number }) => useSessionStorage(key, init),
            { initialProps: { key: 'dyn-k1', init: 1 } }
        );
        expect(result.current[0]).toBe(1);

        rerender({ key: 'dyn-k2', init: 2 });
        expect(result.current[0]).toBe(2);
    });

    it('syncTabs: false ignores a duplicated-tab write but still persists its own', () => {
        const { result } = renderHook(() => useSessionStorage('count', 0, { syncTabs: false }));

        act(() => simulateSameTabWrite('count', '9'));
        expect(result.current[0]).toBe(0);

        act(() => result.current[1](3));
        expect(result.current[0]).toBe(3);
        expect(sessionStorage.getItem('count')).toBe('3');
    });

    it('is independent of useLocalStorage for the same key', async () => {
        const { useLocalStorage } = await import('../useLocalStorage/index');
        localStorage.clear();

        const local = renderHook(() => useLocalStorage('shared-key', 'local'));
        const session = renderHook(() => useSessionStorage('shared-key', 'session'));

        act(() => local.result.current[1]('changed-in-local'));
        expect(session.result.current[0]).toBe('session');
        expect(localStorage.getItem('shared-key')).toBe('"changed-in-local"');
        expect(sessionStorage.getItem('shared-key')).toBeNull();

        localStorage.clear();
    });
});

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
});

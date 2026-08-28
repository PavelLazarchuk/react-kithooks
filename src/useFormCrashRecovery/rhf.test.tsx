import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { useForm } from 'react-hook-form';

import { useFormCrashRecoveryRHF } from './rhf';
import { idbPut, resetIdbCacheForTests } from './idb';

interface Draft {
    title: string;
    amount: number;
}

const KEY = 'rhf-test-form';
const FULL_KEY = `rk:${KEY}`;

async function seedRecord(data: Draft, overrides: Partial<Record<string, unknown>> = {}) {
    await idbPut(FULL_KEY, {
        data,
        savedAt: Date.now(),
        ttlMs: 60_000,
        version: 1,
        tabId: 'other-tab',
        ...overrides,
    });
}

function renderRhf(defaultValues: Draft) {
    return renderHook(() => {
        const { control, reset, setValue, watch } = useForm<Draft>({ defaultValues });
        const recovery = useFormCrashRecoveryRHF<Draft>(control, { key: KEY, debounceMs: 10 });

        return { recovery, reset, setValue, values: watch() };
    });
}

describe('useFormCrashRecoveryRHF', () => {
    beforeEach(() => {
        (globalThis as any).indexedDB = new IDBFactory();
        resetIdbCacheForTests();
        sessionStorage.clear();
    });

    it('saves the live watched form values to storage', async () => {
        const { result } = renderRhf({ title: '', amount: 0 });

        await waitFor(() => expect(result.current.recovery.status).not.toBe('restoring'));

        act(() => {
            result.current.setValue('title', 'typed value');
        });

        await waitFor(() => expect(result.current.recovery.status).toBe('saved'));
    });

    it('applyRecovered merges the recovered draft into the form via reset', async () => {
        await seedRecord({ title: 'recovered title', amount: 42 });

        const { result } = renderRhf({ title: '', amount: 0 });

        await waitFor(() => expect(result.current.recovery.recovered).not.toBeNull());

        act(() => {
            result.current.recovery.applyRecovered(result.current.reset);
        });

        await waitFor(() => expect(result.current.values.title).toBe('recovered title'));
        expect(result.current.values.amount).toBe(42);
    });

    it('applyRecovered is a no-op when there is nothing to restore', async () => {
        const { result } = renderRhf({ title: 'untouched', amount: 7 });

        await waitFor(() => expect(result.current.recovery.status).not.toBe('restoring'));
        expect(result.current.recovery.recovered).toBeNull();

        act(() => {
            result.current.recovery.applyRecovered(result.current.reset);
        });

        expect(result.current.values).toEqual({ title: 'untouched', amount: 7 });
    });

    it('exposes discard/clear passthroughs from the base hook', async () => {
        await seedRecord({ title: 'recovered title', amount: 42 });

        const { result } = renderRhf({ title: '', amount: 0 });

        await waitFor(() => expect(result.current.recovery.recovered).not.toBeNull());

        await act(async () => {
            await result.current.recovery.discard();
        });

        expect(result.current.recovery.recovered).toBeNull();
    });
});

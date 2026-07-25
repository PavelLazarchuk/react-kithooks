import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';

import { useFormCrashRecovery } from './index';
import { idbGet, idbPut, resetIdbCacheForTests } from './idb';
import { deepMergeDefined, omitPaths, stripNonCloneable } from './paths';

const KEY = 'test-form';
const FULL_KEY = `rk:${KEY}`;

interface Draft extends Record<string, unknown> {
    title: string;
    amount?: number;
    card?: { number?: string; name?: string };
    when?: Date;
}

function renderRecovery(
    initial: Draft,
    options: Partial<Parameters<typeof useFormCrashRecovery>[1]> = {}
) {
    return renderHook(
        ({ value }: { value: Draft }) =>
            useFormCrashRecovery<Draft>(value, { key: KEY, debounceMs: 10, ...options }),
        { initialProps: { value: initial } }
    );
}

async function seedRecord(overrides: Partial<Record<string, unknown>> = {}) {
    await idbPut(FULL_KEY, {
        data: { title: 'draft', amount: 5 },
        savedAt: Date.now(),
        ttlMs: 60_000,
        version: 1,
        tabId: 'other-tab',
        ...overrides,
    });
}

describe('paths helpers', () => {
    it('omitPaths strips nested dot-paths without touching siblings or the source', () => {
        const src = { card: { number: '4242', name: 'x' }, note: 'n' };
        const out = omitPaths(src, ['card.number']);
        expect(out.card).toEqual({ name: 'x' });
        expect(out.note).toBe('n');
        expect(src.card.number).toBe('4242');
    });

    it('omitPaths keeps untouched subtree references (structured-clone passthrough)', () => {
        const when = new Date();
        const src = { a: { when }, card: { number: '1' } };
        const out = omitPaths(src, ['card.number']);
        expect(out.a.when).toBe(when);
    });

    it('omitPaths handles array indices and missing paths', () => {
        const src = { items: [{ secret: 1 }, { secret: 2 }] };
        const out = omitPaths(src, ['items.0.secret', 'nope.deep']);
        expect(out.items[0]).toEqual({});
        expect(out.items[1]).toEqual({ secret: 2 });
    });

    it('stripNonCloneable drops functions and reports their paths', () => {
        const { cleaned, dropped } = stripNonCloneable({
            ok: 1,
            cb: () => 1,
            nested: { fn: () => 2, keep: 'yes' },
        });
        expect(cleaned).toEqual({ ok: 1, nested: { keep: 'yes' } });
        expect(dropped).toEqual(['cb', 'nested.fn']);
    });

    it('deepMergeDefined keeps a base value for a key the overrides object is missing entirely', () => {
        const base = { card: { number: '4242', name: 'P L' }, title: 'live edit' };
        const overrides = { card: { name: 'P L' } } as Partial<typeof base>;
        const merged = deepMergeDefined(base, overrides);
        expect(merged).toEqual({ card: { number: '4242', name: 'P L' }, title: 'live edit' });
    });

    it('deepMergeDefined lets overrides replace a primitive or array wholesale', () => {
        const base = { title: 'old', tags: ['a', 'b'] };
        const overrides = { title: 'new', tags: ['c'] };
        expect(deepMergeDefined(base, overrides)).toEqual({ title: 'new', tags: ['c'] });
    });
});

describe('useFormCrashRecovery', () => {
    beforeEach(() => {
        (globalThis as any).indexedDB = new IDBFactory();
        resetIdbCacheForTests();
        sessionStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reports unsupported when indexedDB is missing and never throws', async () => {
        delete (globalThis as any).indexedDB;
        const { result } = renderRecovery({ title: 'a' });
        await waitFor(() => expect(result.current.status).toBe('unsupported'));
        expect(result.current.recovered).toBeNull();
    });

    it('does not write on mount (pristine values must not clobber a stored draft)', async () => {
        await seedRecord();
        const { result } = renderRecovery({ title: '' });
        await waitFor(() => expect(result.current.recovered).not.toBeNull());
        await new Promise(r => setTimeout(r, 50));
        const rec = await idbGet<any>(FULL_KEY);
        expect(rec.data.title).toBe('draft');
    });

    it('persists a changed value after the debounce and reports saved', async () => {
        const { result, rerender } = renderRecovery({ title: '' });
        await waitFor(() => expect(result.current.status).toBe('idle'));

        rerender({ value: { title: 'hello' } });
        rerender({ value: { title: 'hello world' } });

        await waitFor(() => expect(result.current.status).toBe('saved'));
        expect(result.current.lastSavedAt).not.toBeNull();
        const rec = await idbGet<any>(FULL_KEY);
        expect(rec.data.title).toBe('hello world');
        expect(rec.version).toBe(1);
    });

    it('strips excluded dot-paths from what actually hits disk', async () => {
        const { result, rerender } = renderRecovery({ title: '' }, { exclude: ['card.number'] });
        await waitFor(() => expect(result.current.status).toBe('idle'));

        rerender({ value: { title: 'pay', card: { number: '4242-4242', name: 'P L' } } });
        await waitFor(() => expect(result.current.status).toBe('saved'));

        const rec = await idbGet<any>(FULL_KEY);
        expect(rec.data.card.number).toBeUndefined();
        expect(rec.data.card.name).toBe('P L');
    });

    it('offers a stored draft via recovered and consumes it via restore()', async () => {
        await seedRecord();
        const { result } = renderRecovery({ title: '' });

        await waitFor(() => expect(result.current.recovered).not.toBeNull());
        expect(result.current.recovered!.data.title).toBe('draft');
        expect(result.current.recovered!.savedAt).toBeTypeOf('number');

        let data: Draft | null = null;
        act(() => {
            data = result.current.restore();
        });
        expect(data!.title).toBe('draft');
        expect(result.current.recovered).toBeNull();
        expect(result.current.restore()).toBeNull();
    });

    it('round-trips Dates through structured clone', async () => {
        const when = new Date('2026-01-02T03:04:05Z');
        await seedRecord({ data: { title: 'd', when } });
        const { result } = renderRecovery({ title: '' });

        await waitFor(() => expect(result.current.recovered).not.toBeNull());
        const restored = result.current.recovered!.data.when;
        expect(restored).toBeInstanceOf(Date);
        expect((restored as Date).toISOString()).toBe(when.toISOString());
    });

    it('drops expired drafts (TTL) and deletes the record', async () => {
        await seedRecord({ savedAt: Date.now() - 120_000, ttlMs: 60_000 });
        const { result } = renderRecovery({ title: '' });

        await waitFor(() => expect(result.current.status).toBe('idle'));
        expect(result.current.recovered).toBeNull();
        await waitFor(async () => expect(await idbGet(FULL_KEY)).toBeUndefined());
    });

    it('drops drafts with a mismatched version (including newer — rollback deploy)', async () => {
        await seedRecord({ version: 7 });
        const { result } = renderRecovery({ title: '' }, { version: 1 });

        await waitFor(() => expect(result.current.status).toBe('idle'));
        expect(result.current.recovered).toBeNull();
    });

    it('discard() removes the draft; clear() also cancels pending writes', async () => {
        await seedRecord();
        const { result, rerender } = renderRecovery({ title: '' });
        await waitFor(() => expect(result.current.recovered).not.toBeNull());

        await act(async () => {
            await result.current.discard();
        });
        expect(result.current.recovered).toBeNull();
        expect(await idbGet(FULL_KEY)).toBeUndefined();

        rerender({ value: { title: 'typed right before submit' } });
        await act(async () => {
            await result.current.clear();
        });
        await new Promise(r => setTimeout(r, 50));
        expect(await idbGet(FULL_KEY)).toBeUndefined();
        expect(result.current.status).toBe('idle');
    });

    it('survives non-cloneable values by stripping them with a dev warning', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { result, rerender } = renderRecovery({ title: '' });
        await waitFor(() => expect(result.current.status).toBe('idle'));

        rerender({ value: { title: 'x', cb: () => 1 } as any });
        await waitFor(() => expect(result.current.status).toBe('saved'));

        const rec = await idbGet<any>(FULL_KEY);
        expect(rec.data.title).toBe('x');
        expect(rec.data.cb).toBeUndefined();
        expect(warn).toHaveBeenCalledOnce();
    });

    it('notifies onConflict for foreign-tab writes', async () => {
        const onConflict = vi.fn();
        const { result } = renderRecovery({ title: '' }, { onConflict });
        await waitFor(() => expect(result.current.status).toBe('idle'));

        const foreign = new BroadcastChannel(FULL_KEY);
        foreign.postMessage({ tabId: 'other-tab', savedAt: 123 });
        await waitFor(() => expect(onConflict).toHaveBeenCalledWith({ otherTabSavedAt: 123 }));
        foreign.close();
    });

    it('first-tab-wins: a tab that has not written yet stops persisting on foreign write', async () => {
        const { result, rerender } = renderRecovery(
            { title: '' },
            { conflictStrategy: 'first-tab-wins' }
        );
        await waitFor(() => expect(result.current.status).toBe('idle'));

        const foreign = new BroadcastChannel(FULL_KEY);
        foreign.postMessage({ tabId: 'other-tab', savedAt: Date.now() });
        await act(async () => {});

        rerender({ value: { title: 'should not be written' } });
        await new Promise(r => setTimeout(r, 50));
        expect(await idbGet(FULL_KEY)).toBeUndefined();
        foreign.close();
    });

    it('flushes pending writes on unmount (SPA navigation must not lose the draft)', async () => {
        const { result, rerender, unmount } = renderRecovery({ title: '' });
        await waitFor(() => expect(result.current.status).toBe('idle'));

        rerender({ value: { title: 'typed then navigated' } });
        unmount();

        await waitFor(async () => {
            const rec = await idbGet<any>(FULL_KEY);
            expect(rec?.data.title).toBe('typed then navigated');
        });
    });

    it('clears `recovered` when `key` changes to one with no stored draft', async () => {
        await seedRecord();
        const { result, rerender } = renderHook(
            ({ value, key }: { value: Draft; key: string }) =>
                useFormCrashRecovery<Draft>(value, { key, debounceMs: 10 }),
            { initialProps: { value: { title: '' }, key: KEY } }
        );
        await waitFor(() => expect(result.current.recovered).not.toBeNull());

        rerender({ value: { title: '' }, key: 'other-key' });
        await waitFor(() => expect(result.current.status).toBe('idle'));
        expect(result.current.recovered).toBeNull();
    });

    it('flushes a still-debouncing edit to the OLD key, not the new one, when `key` changes mid-debounce', async () => {
        const { result, rerender } = renderHook(
            ({ value, key }: { value: Draft; key: string }) =>
                useFormCrashRecovery<Draft>(value, { key, debounceMs: 50 }),
            { initialProps: { value: { title: '' }, key: 'step-1' } }
        );
        await waitFor(() => expect(result.current.status).toBe('idle'));

        rerender({ value: { title: 'step-1 edit' }, key: 'step-1' });
        rerender({ value: { title: '' }, key: 'step-2' });

        await waitFor(async () => {
            const rec = await idbGet<any>('rk:step-1');
            expect(rec?.data.title).toBe('step-1 edit');
        });
        expect(await idbGet('rk:step-2')).toBeUndefined();
    });

    it('pauses persistence while a recovered draft is unconsumed, to avoid silently overwriting it', async () => {
        await seedRecord();
        const { result, rerender } = renderRecovery({ title: '' });
        await waitFor(() => expect(result.current.recovered).not.toBeNull());

        rerender({ value: { title: 'incidental re-render' } });
        await new Promise(r => setTimeout(r, 50));
        const rec = await idbGet<any>(FULL_KEY);
        expect(rec.data.title).toBe('draft');

        await act(async () => {
            await result.current.discard();
        });
        rerender({ value: { title: 'after discard' } });
        await waitFor(async () => {
            const after = await idbGet<any>(FULL_KEY);
            expect(after?.data.title).toBe('after discard');
        });
    });

    it('restore() immediately after clear() in the same handler does not return a stale draft', async () => {
        await seedRecord();
        const { result } = renderRecovery({ title: '' });
        await waitFor(() => expect(result.current.recovered).not.toBeNull());

        let restored: Draft | null = 'not-called' as unknown as Draft | null;
        await act(async () => {
            await result.current.clear();
            restored = result.current.restore();
        });
        expect(restored).toBeNull();
    });

    it('disabled: true is fully inert', async () => {
        await seedRecord();
        const { result, rerender } = renderRecovery({ title: '' }, { disabled: true });
        rerender({ value: { title: 'nope' } });
        await new Promise(r => setTimeout(r, 50));

        expect(result.current.status).toBe('idle');
        expect(result.current.recovered).toBeNull();
        const rec = await idbGet<any>(FULL_KEY);
        expect(rec.data.title).toBe('draft');
    });
});

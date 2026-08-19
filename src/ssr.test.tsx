// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import {
    AsyncQueueProvider,
    KeyboardScopeProvider,
    useAbortableFetch,
    useAsyncQueue,
    useBreakpoint,
    useDebouncedCallback,
    useDebouncedValue,
    useFormCrashRecovery,
    useIdle,
    useIndexedDB,
    useIndexedDBCollection,
    useIsFirstRender,
    useKeyboardScope,
    useLocalStorage,
    useMediaQuery,
    useOnlineStatus,
    usePermission,
    usePolling,
    usePrefersColorScheme,
    usePrefersReducedMotion,
    usePreviousValue,
    useScrollAnchor,
    useSessionStorage,
    useSingleFlight,
    useTabLeader,
    useThrottledCallback,
    useThrottledValue,
} from './index';

function ssr<T>(useHook: () => T): T {
    let captured!: T;
    let renders = 0;

    function Probe() {
        captured = useHook();
        renders += 1;

        return null;
    }

    renderToString(createElement(Probe));
    expect(renders).toBeGreaterThan(0);

    return captured;
}

const never = () => new Promise<string>(() => undefined);
const noop = () => undefined;

describe('SSR', () => {
    it('runs with no DOM at all', () => {
        expect(typeof window).toBe('undefined');
        expect(typeof document).toBe('undefined');
        expect(typeof localStorage).toBe('undefined');
        expect(typeof indexedDB).toBe('undefined');
        expect(typeof requestAnimationFrame).toBe('undefined');
    });

    it('imports the whole kit without touching the DOM at module scope', async () => {
        await expect(import('./index')).resolves.toBeDefined();
        await expect(import('./useFormCrashRecovery/rhf')).resolves.toBeDefined();
    });

    describe('UI & interaction', () => {
        it('useScrollAnchor starts at the bottom', () => {
            const result = ssr(() => useScrollAnchor());

            expect(result.isAtBottom).toBe(true);
            expect(typeof result.ref).toBe('function');
        });

        it('useKeyboardScope is not top-most', () => {
            expect(ssr(() => useKeyboardScope({ Escape: noop })).isTopMost).toBe(false);
        });

        it('KeyboardScopeProvider renders its children', () => {
            const html = renderToString(
                createElement(KeyboardScopeProvider, null, createElement('p', null, 'child'))
            );

            expect(html).toContain('child');
        });

        it('useMediaQuery returns serverFallback', () => {
            expect(ssr(() => useMediaQuery('(min-width: 600px)'))).toBe(false);
            expect(ssr(() => useMediaQuery('(min-width: 600px)', { serverFallback: true }))).toBe(
                true
            );
        });

        it('useBreakpoint returns the base name', () => {
            expect(ssr(() => useBreakpoint({ sm: 640, lg: 1024 }))).toBe('base');
            expect(ssr(() => useBreakpoint({ sm: 640 }, { base: 'xs' }))).toBe('xs');
            expect(ssr(() => useBreakpoint({ sm: 640 }, { serverFallback: 'sm' }))).toBe('sm');
        });

        it('usePrefersColorScheme is light', () => {
            expect(ssr(() => usePrefersColorScheme())).toBe('light');
            expect(ssr(() => usePrefersColorScheme({ serverFallback: 'dark' }))).toBe('dark');
        });

        it('usePrefersReducedMotion is false', () => {
            expect(ssr(() => usePrefersReducedMotion())).toBe(false);
            expect(ssr(() => usePrefersReducedMotion({ serverFallback: true }))).toBe(true);
        });
    });

    describe('browser capabilities', () => {
        it('usePermission is loading', () => {
            const result = ssr(() => usePermission('camera'));

            expect(result.status).toBe('loading');
            expect(result.isGranted).toBe(false);
            expect(result.isDenied).toBe(false);
        });

        it('useOnlineStatus is online, and never pings', () => {
            expect(ssr(() => useOnlineStatus()).isOnline).toBe(true);
            expect(ssr(() => useOnlineStatus({ pingUrl: '/health' })).isOnline).toBe(true);
        });

        it('useTabLeader is a pending non-leader', () => {
            expect(ssr(() => useTabLeader('room'))).toMatchObject({
                isLeader: false,
                status: 'pending',
                mechanism: null,
            });
        });

        it('useIdle is active', () => {
            expect(ssr(() => useIdle(60_000)).isIdle).toBe(false);
            expect(ssr(() => useIdle(60_000, { syncAcrossTabs: true })).isIdle).toBe(false);
        });
    });

    describe('storage & persistence', () => {
        it('useLocalStorage returns initialValue', () => {
            expect(ssr(() => useLocalStorage('k', 'initial'))[0]).toBe('initial');
            expect(ssr(() => useLocalStorage('k', () => 'lazy'))[0]).toBe('lazy');
        });

        it('useSessionStorage returns initialValue', () => {
            expect(ssr(() => useSessionStorage('k', 'initial'))[0]).toBe('initial');
        });

        it('useIndexedDB returns initialValue while loading', () => {
            const [value, , , status] = ssr(() => useIndexedDB('k', 'initial'));

            expect(value).toBe('initial');
            expect(status).toBe('loading');
        });

        it('useIndexedDBCollection is empty while loading', () => {
            const result = ssr(() => useIndexedDBCollection<{ id: string }>());

            expect(result.items).toEqual([]);
            expect(result.records).toEqual([]);
            expect(result.status).toBe('loading');
        });

        it('useFormCrashRecovery offers nothing', () => {
            const result = ssr(() => useFormCrashRecovery({ title: 'draft' }, { key: 'form' }));

            expect(result.recovered).toBeNull();
            expect(result.status).toBe('idle');
            expect(result.lastSavedAt).toBeNull();
        });
    });

    describe('async', () => {
        it('useAbortableFetch is idle and never runs the fetcher', () => {
            let calls = 0;
            const result = ssr(() =>
                useAbortableFetch(() => {
                    calls += 1;

                    return never();
                }, [])
            );

            expect(calls).toBe(0);
            expect(result.status).toBe('idle');
            expect(result.isLoading).toBe(false);
            expect(result.isFetching).toBe(false);
            expect(result.data).toBeUndefined();
        });

        it('usePolling is idle and never polls', () => {
            let calls = 0;
            const result = ssr(() =>
                usePolling(() => {
                    calls += 1;

                    return never();
                }, [])
            );

            expect(calls).toBe(0);
            expect(result.status).toBe('idle');
            expect(result.isPaused).toBe(false);
            expect(result.isFetching).toBe(false);
        });

        it('useSingleFlight is not pending and never runs fn', () => {
            let calls = 0;
            const [run, controls] = ssr(() =>
                useSingleFlight(() => {
                    calls += 1;

                    return never();
                })
            );

            expect(calls).toBe(0);
            expect(controls.pending).toBe(false);
            expect(typeof run).toBe('function');
        });

        it('useAsyncQueue is an empty idle queue', () => {
            const expected = {
                status: 'idle',
                pending: 0,
                running: 0,
                queued: 0,
                isPaused: false,
            };

            expect(ssr(() => useAsyncQueue())).toMatchObject(expected);
            expect(ssr(() => useAsyncQueue('row:7'))).toMatchObject(expected);
        });

        it('AsyncQueueProvider renders its children', () => {
            const html = renderToString(
                createElement(AsyncQueueProvider, null, createElement('p', null, 'child'))
            );

            expect(html).toContain('child');
        });

        it('useDebouncedValue returns the current value', () => {
            expect(ssr(() => useDebouncedValue('now', 300))).toBe('now');
            expect(ssr(() => useDebouncedValue('now', 300, { controls: true }))).toMatchObject({
                value: 'now',
                isPending: false,
            });
        });

        it('useDebouncedCallback is inert', () => {
            expect(ssr(() => useDebouncedCallback(noop, 300)).isPending()).toBe(false);
        });

        it('useThrottledValue returns the current value', () => {
            expect(ssr(() => useThrottledValue('now', 100))).toBe('now');
            expect(ssr(() => useThrottledValue('now', 'frame'))).toBe('now');
            expect(ssr(() => useThrottledValue('now', 100, { controls: true }))).toMatchObject({
                value: 'now',
                isPending: false,
            });
        });

        it('useThrottledCallback is inert, including in frame mode', () => {
            expect(ssr(() => useThrottledCallback(noop, 100)).isPending()).toBe(false);
            expect(ssr(() => useThrottledCallback(noop, 'frame')).isPending()).toBe(false);
        });
    });

    describe('render bookkeeping', () => {
        it('useIsFirstRender is true', () => {
            expect(ssr(() => useIsFirstRender())).toBe(true);
        });

        it('usePreviousValue is undefined', () => {
            expect(ssr(() => usePreviousValue('a'))).toBeUndefined();
        });
    });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';

import { AsyncQueueProvider, useAsyncQueue } from './index';
import { getAsyncQueue, resetAsyncQueuesForTests } from './store';

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
}

interface NodeProcessLike {
    on: (event: 'unhandledRejection', listener: (reason: unknown) => void) => void;
    off: (event: 'unhandledRejection', listener: (reason: unknown) => void) => void;
}

function deferred<T = void>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });

    return { promise, resolve, reject };
}

async function flush() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

const providerWrapper = ({ children }: { children: ReactNode }) =>
    createElement(AsyncQueueProvider, null, children);

describe('useAsyncQueue', () => {
    beforeEach(() => {
        resetAsyncQueuesForTests();
    });

    afterEach(() => {
        resetAsyncQueuesForTests();
        vi.restoreAllMocks();
    });

    it('resolves with the task result', async () => {
        const { result } = renderHook(() => useAsyncQueue());

        let value: string | undefined;
        await act(async () => {
            value = await result.current.enqueue(async () => 'done');
        });

        expect(value).toBe('done');
    });

    it('does not start a task until the previous one settles', async () => {
        const { result } = renderHook(() => useAsyncQueue());
        const first = deferred();
        const started: string[] = [];

        act(() => {
            void result.current.enqueue(async () => {
                started.push('a');
                await first.promise;
            });
            void result.current.enqueue(async () => {
                started.push('b');
            });
        });
        await flush();

        expect(started).toEqual(['a']);

        await act(async () => {
            first.resolve();
        });
        await flush();

        expect(started).toEqual(['a', 'b']);
    });

    it('resolves tasks in enqueue order even when the later one is faster', async () => {
        const { result } = renderHook(() => useAsyncQueue());
        const slow = deferred();
        const settled: string[] = [];

        await act(async () => {
            void result.current.enqueue(async () => {
                await slow.promise;
                settled.push('slow');
            });
            void result.current.enqueue(async () => {
                settled.push('fast');
            });
            slow.resolve();
        });
        await flush();

        expect(settled).toEqual(['slow', 'fast']);
    });

    it('a failing task rejects its own promise without blocking the queue', async () => {
        const { result } = renderHook(() => useAsyncQueue());
        const boom = new Error('boom');
        let caught: unknown;
        let secondRan = false;

        await act(async () => {
            const failing = result.current.enqueue(async () => {
                throw boom;
            });
            failing.catch(error => {
                caught = error;
            });

            void result.current.enqueue(async () => {
                secondRan = true;
            });
        });
        await flush();

        expect(caught).toBe(boom);
        expect(secondRan).toBe(true);
    });

    it('tracks status and pending across the whole run', async () => {
        const { result } = renderHook(() => useAsyncQueue());
        const gate = deferred();

        expect(result.current.status).toBe('idle');
        expect(result.current.pending).toBe(0);

        act(() => {
            void result.current.enqueue(() => gate.promise);
            void result.current.enqueue(async () => undefined);
        });

        expect(result.current.status).toBe('running');
        expect(result.current.pending).toBe(2);

        await act(async () => {
            gate.resolve();
        });

        await waitFor(() => expect(result.current.status).toBe('idle'));
        expect(result.current.pending).toBe(0);
    });

    it('shares one queue between separate hook instances using the same key', async () => {
        const a = renderHook(() => useAsyncQueue('shared'));
        const b = renderHook(() => useAsyncQueue('shared'));
        const gate = deferred();
        const started: string[] = [];

        act(() => {
            void a.result.current.enqueue(async () => {
                started.push('a');
                await gate.promise;
            });
            void b.result.current.enqueue(async () => {
                started.push('b');
            });
        });
        await flush();

        expect(started).toEqual(['a']);
        expect(b.result.current.pending).toBe(2);

        await act(async () => {
            gate.resolve();
        });
        await flush();

        expect(started).toEqual(['a', 'b']);
    });

    it('runs different keys concurrently', async () => {
        const a = renderHook(() => useAsyncQueue('key-a'));
        const b = renderHook(() => useAsyncQueue('key-b'));
        const gate = deferred();
        const started: string[] = [];

        act(() => {
            void a.result.current.enqueue(async () => {
                started.push('a');
                await gate.promise;
            });
            void b.result.current.enqueue(async () => {
                started.push('b');
            });
        });
        await flush();

        expect(started).toEqual(['a', 'b']);
        expect(a.result.current.pending).toBe(1);
        expect(b.result.current.pending).toBe(0);

        await act(async () => {
            gate.resolve();
        });
    });

    it('keeps keyless hooks isolated when there is no provider', async () => {
        const a = renderHook(() => useAsyncQueue());
        const b = renderHook(() => useAsyncQueue());
        const gate = deferred();
        const started: string[] = [];

        act(() => {
            void a.result.current.enqueue(async () => {
                started.push('a');
                await gate.promise;
            });
            void b.result.current.enqueue(async () => {
                started.push('b');
            });
        });
        await flush();

        expect(started).toEqual(['a', 'b']);
        expect(b.result.current.pending).toBe(0);

        await act(async () => {
            gate.resolve();
        });
    });

    it('shares the provider queue between keyless hooks inside it', async () => {
        const a = renderHook(() => useAsyncQueue(), { wrapper: providerWrapper });
        const b = renderHook(() => useAsyncQueue(), { wrapper: providerWrapper });
        const gate = deferred();
        const started: string[] = [];

        act(() => {
            void a.result.current.enqueue(async () => {
                started.push('a');
                await gate.promise;
            });
            void b.result.current.enqueue(async () => {
                started.push('b');
            });
        });
        await flush();

        expect(started).toEqual(['a', 'b']);

        await act(async () => {
            gate.resolve();
        });
    });

    it('serializes two keyless hooks rendered under the same provider', async () => {
        const gate = deferred();
        const started: string[] = [];

        const { result } = renderHook(() => ({ first: useAsyncQueue(), second: useAsyncQueue() }), {
            wrapper: providerWrapper,
        });

        act(() => {
            void result.current.first.enqueue(async () => {
                started.push('a');
                await gate.promise;
            });
            void result.current.second.enqueue(async () => {
                started.push('b');
            });
        });
        await flush();

        expect(started).toEqual(['a']);
        expect(result.current.second.pending).toBe(2);

        await act(async () => {
            gate.resolve();
        });
        await flush();

        expect(started).toEqual(['a', 'b']);
    });

    it('lets a key opt out of the surrounding provider queue', async () => {
        const gate = deferred();
        const started: string[] = [];

        const { result } = renderHook(
            () => ({ shared: useAsyncQueue(), keyed: useAsyncQueue('escapes') }),
            { wrapper: providerWrapper }
        );

        act(() => {
            void result.current.shared.enqueue(async () => {
                started.push('provider');
                await gate.promise;
            });
            void result.current.keyed.enqueue(async () => {
                started.push('keyed');
            });
        });
        await flush();

        expect(started).toEqual(['provider', 'keyed']);

        await act(async () => {
            gate.resolve();
        });
    });

    it('finishes a queued task after the component unmounts', async () => {
        const { result, unmount } = renderHook(() => useAsyncQueue('outlives'));
        const gate = deferred();
        let finished = false;

        act(() => {
            void result.current.enqueue(async () => {
                await gate.promise;
                finished = true;
            });
        });
        await flush();

        unmount();

        await act(async () => {
            gate.resolve();
        });
        await flush();

        expect(finished).toBe(true);
    });

    it('routes failures to onError without an unhandled rejection', async () => {
        const onError = vi.fn();
        const unhandled = vi.fn();
        const nodeProcess = (globalThis as { process?: NodeProcessLike }).process;

        expect(nodeProcess).toBeDefined();
        nodeProcess?.on('unhandledRejection', unhandled);

        const { result } = renderHook(() => useAsyncQueue(undefined, { onError }));
        const boom = new Error('nope');

        act(() => {
            void result.current.enqueue(async () => {
                throw boom;
            });
        });

        await waitFor(() => expect(onError).toHaveBeenCalledWith(boom));
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(unhandled).not.toHaveBeenCalled();
        nodeProcess?.off('unhandledRejection', unhandled);
    });

    it('keeps enqueue identity stable across re-renders', () => {
        const { result, rerender } = renderHook(() => useAsyncQueue('stable'));
        const first = result.current.enqueue;

        rerender();

        expect(result.current.enqueue).toBe(first);
    });

    describe('lifetime of keyed queues', () => {
        it('releases a queue once nothing observes it and nothing is queued', async () => {
            const { unmount } = renderHook(() => useAsyncQueue('life:free'));
            const before = getAsyncQueue('life:free');

            unmount();
            await flush();

            expect(getAsyncQueue('life:free')).not.toBe(before);
        });

        it('keeps a queue with work in flight, so the next mount joins it', async () => {
            const gate = deferred();
            const { result, unmount } = renderHook(() => useAsyncQueue('life:busy'));
            const before = getAsyncQueue('life:busy');

            act(() => {
                void result.current.enqueue(() => gate.promise);
            });
            unmount();
            await flush();

            expect(getAsyncQueue('life:busy')).toBe(before);

            await act(async () => {
                gate.resolve();
                await gate.promise;
            });
        });

        it('keeps a queue that another component still observes', async () => {
            const first = renderHook(() => useAsyncQueue('life:shared'));
            const second = renderHook(() => useAsyncQueue('life:shared'));
            const before = getAsyncQueue('life:shared');

            first.unmount();
            await flush();

            expect(getAsyncQueue('life:shared')).toBe(before);
            second.unmount();
        });

        it('preserves ordering across an unmount while a task is still running', async () => {
            const gate = deferred();
            const order: string[] = [];

            const first = renderHook(() => useAsyncQueue('life:order'));
            act(() => {
                void first.result.current.enqueue(async () => {
                    await gate.promise;
                    order.push('first');
                });
            });
            first.unmount();
            await flush();

            const second = renderHook(() => useAsyncQueue('life:order'));
            act(() => {
                void second.result.current.enqueue(async () => {
                    order.push('second');
                });
            });

            await act(async () => {
                gate.resolve();
                await gate.promise;
            });
            await flush();

            expect(order).toEqual(['first', 'second']);
            second.unmount();
        });
    });

    it('switches queues when the key changes', async () => {
        const gate = deferred();
        const { result, rerender } = renderHook(({ key }: { key: string }) => useAsyncQueue(key), {
            initialProps: { key: 'k1' },
        });

        act(() => {
            void result.current.enqueue(() => gate.promise);
        });
        expect(result.current.pending).toBe(1);

        rerender({ key: 'k2' });
        expect(result.current.pending).toBe(0);
        expect(result.current.status).toBe('idle');

        await act(async () => {
            gate.resolve();
        });
    });
});

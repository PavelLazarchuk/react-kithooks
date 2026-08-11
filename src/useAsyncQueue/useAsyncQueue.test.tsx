import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';

import {
    AsyncQueueClearedError,
    AsyncQueueProvider,
    AsyncQueueReplacedError,
    useAsyncQueue,
} from './index';
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

    describe('concurrency', () => {
        it('runs at most `concurrency` tasks at once, admitting them in order', async () => {
            const gates = [deferred(), deferred(), deferred(), deferred()];
            const started: number[] = [];

            const { result } = renderHook(() => useAsyncQueue(undefined, { concurrency: 2 }));
            await flush();

            act(() => {
                gates.forEach((gate, i) => {
                    void result.current.enqueue(async () => {
                        started.push(i);
                        await gate.promise;
                    });
                });
            });
            await flush();

            expect(started).toEqual([0, 1]);
            expect(result.current.running).toBe(2);
            expect(result.current.queued).toBe(2);
            expect(result.current.pending).toBe(4);

            await act(async () => {
                gates[0]!.resolve();
            });
            await flush();

            expect(started).toEqual([0, 1, 2]);
            expect(result.current.running).toBe(2);
            expect(result.current.queued).toBe(1);

            await act(async () => {
                gates[1]!.resolve();
                gates[2]!.resolve();
                gates[3]!.resolve();
            });
            await flush();

            expect(result.current.status).toBe('idle');
        });

        it('defaults to a mutex — one at a time', async () => {
            const gates = [deferred(), deferred()];
            const started: number[] = [];

            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                gates.forEach((gate, i) => {
                    void result.current.enqueue(async () => {
                        started.push(i);
                        await gate.promise;
                    });
                });
            });
            await flush();

            expect(started).toEqual([0]);
            expect(result.current.running).toBe(1);

            await act(async () => {
                gates[0]!.resolve();
                gates[1]!.resolve();
            });
            await flush();
        });

        it('admits waiting tasks immediately when the limit is raised', async () => {
            const gates = [deferred(), deferred(), deferred()];
            const started: number[] = [];

            const { result, rerender } = renderHook(
                ({ concurrency }: { concurrency: number }) =>
                    useAsyncQueue('pool', { concurrency }),
                { initialProps: { concurrency: 1 } }
            );
            await flush();

            act(() => {
                gates.forEach((gate, i) => {
                    void result.current.enqueue(async () => {
                        started.push(i);
                        await gate.promise;
                    });
                });
            });
            await flush();
            expect(started).toEqual([0]);

            rerender({ concurrency: 3 });
            await flush();

            expect(started).toEqual([0, 1, 2]);

            await act(async () => {
                gates.forEach(gate => gate.resolve());
            });
            await flush();
        });

        it('cannot un-start running tasks when the limit is lowered', async () => {
            const gates = [deferred(), deferred()];
            const started: number[] = [];

            const { result, rerender } = renderHook(
                ({ concurrency }: { concurrency: number }) =>
                    useAsyncQueue('shrink', { concurrency }),
                { initialProps: { concurrency: 2 } }
            );
            await flush();

            act(() => {
                gates.forEach((gate, i) => {
                    void result.current.enqueue(async () => {
                        started.push(i);
                        await gate.promise;
                    });
                });
            });
            await flush();
            expect(result.current.running).toBe(2);

            rerender({ concurrency: 1 });
            await flush();

            expect(result.current.running).toBe(2);

            await act(async () => {
                gates.forEach(gate => gate.resolve());
            });
            await flush();
        });

        it('treats a nonsensical concurrency as 1 rather than stalling the queue', async () => {
            const gate = deferred();
            const { result } = renderHook(() => useAsyncQueue(undefined, { concurrency: 0 }));
            await flush();

            act(() => {
                void result.current.enqueue(() => gate.promise);
            });
            await flush();

            expect(result.current.running).toBe(1);

            await act(async () => {
                gate.resolve();
            });
            await flush();
        });
    });

    describe('clear', () => {
        it('drops queued tasks without touching the running one', async () => {
            const gate = deferred();
            const started: number[] = [];

            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                void result.current.enqueue(async () => {
                    started.push(0);
                    await gate.promise;
                });
                void result.current.enqueue(async () => {
                    started.push(1);
                });
                void result.current.enqueue(async () => {
                    started.push(2);
                });
            });
            await flush();

            expect(result.current.queued).toBe(2);

            let dropped = 0;
            act(() => {
                dropped = result.current.clear();
            });

            expect(dropped).toBe(2);
            expect(result.current.queued).toBe(0);
            expect(result.current.running).toBe(1);

            await act(async () => {
                gate.resolve();
            });
            await flush();

            expect(started).toEqual([0]);
            expect(result.current.status).toBe('idle');
        });

        it('rejects the promises of dropped tasks instead of leaving them unsettled', async () => {
            const gate = deferred();
            const { result } = renderHook(() => useAsyncQueue());

            let rejection: unknown;
            act(() => {
                void result.current.enqueue(() => gate.promise);
                result.current
                    .enqueue(async () => 'never')
                    .catch(error => {
                        rejection = error;
                    });
            });
            await flush();

            act(() => {
                result.current.clear();
            });
            await flush();

            expect((rejection as Error).name).toBe('AsyncQueueClearedError');

            await act(async () => {
                gate.resolve();
            });
            await flush();
        });

        it('does not spray unhandled rejections over fire-and-forget tasks', async () => {
            const unhandled = vi.fn();
            const nodeProcess = (globalThis as { process?: NodeProcessLike }).process;

            expect(nodeProcess).toBeDefined();
            nodeProcess?.on('unhandledRejection', unhandled);

            const gate = deferred();
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                void result.current.enqueue(() => gate.promise);
                void result.current.enqueue(async () => 'dropped');
                void result.current.enqueue(async () => 'dropped too');
            });
            await flush();

            act(() => {
                result.current.clear();
            });

            await act(async () => {
                gate.resolve();
            });
            await new Promise(resolve => setTimeout(resolve, 20));

            expect(unhandled).not.toHaveBeenCalled();
            nodeProcess?.off('unhandledRejection', unhandled);
        });

        it('is a no-op on an empty queue', async () => {
            const { result } = renderHook(() => useAsyncQueue());

            let dropped = -1;
            act(() => {
                dropped = result.current.clear();
            });

            expect(dropped).toBe(0);
            expect(result.current.status).toBe('idle');
        });
    });

    describe('priority', () => {
        it('admits a higher-priority task ahead of ones already waiting', async () => {
            const gate = deferred();
            const started: string[] = [];
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                void result.current.enqueue(() => gate.promise);
                void result.current.enqueue(async () => {
                    started.push('normal');
                });
                void result.current.enqueue(
                    async () => {
                        started.push('urgent');
                    },
                    { priority: 10 }
                );
                void result.current.enqueue(
                    async () => {
                        started.push('background');
                    },
                    { priority: -1 }
                );
            });
            await flush();

            await act(async () => {
                gate.resolve();
            });
            await waitFor(() => expect(started).toHaveLength(3));

            expect(started).toEqual(['urgent', 'normal', 'background']);
        });

        it('keeps FIFO order within one priority tier', async () => {
            const gate = deferred();
            const started: string[] = [];
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                void result.current.enqueue(() => gate.promise);

                for (const label of ['a', 'b', 'c']) {
                    void result.current.enqueue(
                        async () => {
                            started.push(label);
                        },
                        { priority: 5 }
                    );
                }
            });
            await flush();

            await act(async () => {
                gate.resolve();
            });
            await waitFor(() => expect(started).toHaveLength(3));

            expect(started).toEqual(['a', 'b', 'c']);
        });

        it('treats Infinity as first in line and a NaN priority as the default tier', async () => {
            const gate = deferred();
            const started: string[] = [];
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                void result.current.enqueue(() => gate.promise);
                void result.current.enqueue(async () => {
                    started.push('normal');
                });
                void result.current.enqueue(
                    async () => {
                        started.push('nan');
                    },
                    { priority: Number.NaN }
                );
                void result.current.enqueue(
                    async () => {
                        started.push('first');
                    },
                    { priority: Number.POSITIVE_INFINITY }
                );
            });
            await flush();

            await act(async () => {
                gate.resolve();
            });
            await waitFor(() => expect(started).toHaveLength(3));

            expect(started).toEqual(['first', 'normal', 'nan']);
        });

        it('cannot preempt a task that has already started', async () => {
            const gate = deferred();
            const started: string[] = [];
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                void result.current.enqueue(async () => {
                    started.push('running');
                    await gate.promise;
                });
            });
            await flush();

            act(() => {
                void result.current.enqueue(
                    async () => {
                        started.push('urgent');
                    },
                    { priority: 100 }
                );
            });
            await flush();

            expect(started).toEqual(['running']);

            await act(async () => {
                gate.resolve();
            });
            await waitFor(() => expect(started).toEqual(['running', 'urgent']));
        });
    });

    describe('pause and resume', () => {
        it('holds queued tasks until resume', async () => {
            const started: string[] = [];
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                result.current.pause();
            });

            expect(result.current.isPaused).toBe(true);
            expect(result.current.status).toBe('paused');

            act(() => {
                void result.current.enqueue(async () => {
                    started.push('a');
                });
            });
            await flush();

            expect(started).toEqual([]);
            expect(result.current.queued).toBe(1);
            expect(result.current.status).toBe('paused');

            act(() => {
                result.current.resume();
            });
            await waitFor(() => expect(started).toEqual(['a']));

            expect(result.current.isPaused).toBe(false);
            expect(result.current.status).toBe('idle');
        });

        it('lets an already-running task finish', async () => {
            const gate = deferred();
            const settled: string[] = [];
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                void result.current.enqueue(async () => {
                    await gate.promise;
                    settled.push('running');
                });
            });
            await flush();

            act(() => {
                result.current.pause();
            });

            expect(result.current.running).toBe(1);
            expect(result.current.status).toBe('running');

            await act(async () => {
                gate.resolve();
            });
            await waitFor(() => expect(settled).toEqual(['running']));

            expect(result.current.status).toBe('paused');
        });

        it('is idempotent, and resume on a live queue is a no-op', async () => {
            const started: string[] = [];
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                result.current.resume();
                result.current.pause();
                result.current.pause();
            });

            act(() => {
                void result.current.enqueue(async () => {
                    started.push('a');
                });
            });
            await flush();
            expect(started).toEqual([]);

            act(() => {
                result.current.resume();
                result.current.resume();
            });
            await waitFor(() => expect(started).toEqual(['a']));
        });

        it('still drains in priority order after a resume', async () => {
            const started: string[] = [];
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                result.current.pause();
                void result.current.enqueue(async () => {
                    started.push('normal');
                });
                void result.current.enqueue(
                    async () => {
                        started.push('urgent');
                    },
                    { priority: 1 }
                );
            });
            await flush();

            act(() => {
                result.current.resume();
            });
            await waitFor(() => expect(started).toHaveLength(2));

            expect(started).toEqual(['urgent', 'normal']);
        });

        it('keeps a paused keyed queue alive across a remount, so resume still works', async () => {
            const first = renderHook(() => useAsyncQueue('paused:life'));
            const queue = getAsyncQueue('paused:life');

            act(() => {
                first.result.current.pause();
            });
            first.unmount();
            await flush();

            expect(getAsyncQueue('paused:life')).toBe(queue);

            const started: string[] = [];
            const second = renderHook(() => useAsyncQueue('paused:life'));

            expect(second.result.current.isPaused).toBe(true);

            act(() => {
                void second.result.current.enqueue(async () => {
                    started.push('a');
                });
            });
            await flush();
            expect(started).toEqual([]);

            act(() => {
                second.result.current.resume();
            });
            await waitFor(() => expect(started).toEqual(['a']));
        });
    });

    describe('idle', () => {
        it('resolves immediately when nothing is in flight', async () => {
            const { result } = renderHook(() => useAsyncQueue());

            await expect(result.current.idle()).resolves.toBeUndefined();
        });

        it('waits for the running task and everything behind it', async () => {
            const gate = deferred();
            const settled: string[] = [];
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                void result.current.enqueue(async () => {
                    await gate.promise;
                    settled.push('a');
                });
                void result.current.enqueue(async () => {
                    settled.push('b');
                });
            });
            await flush();

            let drained = false;
            const idle = result.current.idle().then(() => {
                drained = true;
            });

            await flush();
            expect(drained).toBe(false);
            expect(settled).toEqual([]);

            await act(async () => {
                gate.resolve();
                await idle;
            });

            expect(drained).toBe(true);
            expect(settled).toEqual(['a', 'b']);
            expect(result.current.status).toBe('idle');
        });

        it('resolves after a failing task — draining is not the same as succeeding', async () => {
            const gate = deferred();
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                result.current
                    .enqueue(async () => {
                        await gate.promise;
                        throw new Error('boom');
                    })
                    .catch(() => undefined);
            });
            await flush();

            let drained = false;
            const idle = result.current.idle().then(() => {
                drained = true;
            });

            await flush();
            expect(drained).toBe(false);

            await act(async () => {
                gate.resolve();
                await idle;
            });

            expect(drained).toBe(true);
        });

        it('stays pending while a paused queue still holds tasks', async () => {
            const started: string[] = [];
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                result.current.pause();
            });
            act(() => {
                void result.current.enqueue(async () => {
                    started.push('a');
                });
            });
            await flush();

            let drained = false;
            const idle = result.current.idle().then(() => {
                drained = true;
            });

            await flush();
            expect(drained).toBe(false);

            act(() => {
                result.current.resume();
            });
            await act(async () => {
                await idle;
            });

            expect(drained).toBe(true);
            expect(started).toEqual(['a']);
        });

        it('counts a cleared task as drained, but still waits for the running one', async () => {
            const gate = deferred();
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                void result.current.enqueue(async () => {
                    await gate.promise;
                });
                result.current.enqueue(async () => undefined).catch(() => undefined);
            });
            await flush();

            let drained = false;
            const idle = result.current.idle().then(() => {
                drained = true;
            });

            act(() => {
                result.current.clear();
            });
            await flush();
            expect(drained).toBe(false);

            await act(async () => {
                gate.resolve();
                await idle;
            });

            expect(drained).toBe(true);
        });

        it('resolves every waiter, including one from another component on the same key', async () => {
            const gate = deferred();
            const first = renderHook(() => useAsyncQueue('drain:shared'));
            const second = renderHook(() => useAsyncQueue('drain:shared'));

            act(() => {
                void first.result.current.enqueue(async () => {
                    await gate.promise;
                });
            });
            await flush();

            const drained: string[] = [];
            const a = first.result.current.idle().then(() => drained.push('a'));
            const b = second.result.current.idle().then(() => drained.push('b'));

            await flush();
            expect(drained).toEqual([]);

            await act(async () => {
                gate.resolve();
                await Promise.all([a, b]);
            });

            expect(drained).toEqual(['a', 'b']);
        });

        it('starts a fresh cycle for work enqueued after it drained', async () => {
            const { result } = renderHook(() => useAsyncQueue());
            const gate = deferred();

            await act(async () => {
                await result.current.idle();
            });

            act(() => {
                void result.current.enqueue(async () => {
                    await gate.promise;
                });
            });
            await flush();

            let drained = false;
            const idle = result.current.idle().then(() => {
                drained = true;
            });

            await flush();
            expect(drained).toBe(false);

            await act(async () => {
                gate.resolve();
                await idle;
            });

            expect(drained).toBe(true);
        });
    });

    describe('keyed tasks', () => {
        it('replace drops the task still waiting under the same key', async () => {
            const gate = deferred();
            const ran: string[] = [];
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                void result.current.enqueue(() => gate.promise);

                for (const label of ['save-1', 'save-2', 'save-3']) {
                    void result.current.enqueue(
                        async () => {
                            ran.push(label);
                        },
                        { key: 'save', replace: true }
                    );
                }
            });
            await flush();

            expect(result.current.queued).toBe(1);

            await act(async () => {
                gate.resolve();
            });
            await waitFor(() => expect(ran).toEqual(['save-3']));
        });

        it('rejects the replaced task with an AsyncQueueReplacedError', async () => {
            const gate = deferred();
            const { result } = renderHook(() => useAsyncQueue());

            let rejection: unknown;
            act(() => {
                void result.current.enqueue(() => gate.promise);
                result.current
                    .enqueue(async () => 'stale', { key: 'save', replace: true })
                    .catch(error => {
                        rejection = error;
                    });
                void result.current.enqueue(async () => 'fresh', { key: 'save', replace: true });
            });
            await flush();

            expect(rejection).toBeInstanceOf(AsyncQueueReplacedError);
            expect((rejection as Error).name).toBe('AsyncQueueReplacedError');

            await act(async () => {
                gate.resolve();
            });
            await flush();
        });

        it('leaves waiting tasks under a different key alone', async () => {
            const gate = deferred();
            const ran: string[] = [];
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                void result.current.enqueue(() => gate.promise);
                void result.current.enqueue(
                    async () => {
                        ran.push('row-1');
                    },
                    { key: 'row:1', replace: true }
                );
                void result.current.enqueue(
                    async () => {
                        ran.push('row-2');
                    },
                    { key: 'row:2', replace: true }
                );
            });
            await flush();

            expect(result.current.queued).toBe(2);

            await act(async () => {
                gate.resolve();
            });
            await waitFor(() => expect(ran).toEqual(['row-1', 'row-2']));
        });

        it('keeps both tasks when replace is not set', async () => {
            const gate = deferred();
            const ran: string[] = [];
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                void result.current.enqueue(() => gate.promise);
                void result.current.enqueue(
                    async () => {
                        ran.push('first');
                    },
                    { key: 'save' }
                );
                void result.current.enqueue(
                    async () => {
                        ran.push('second');
                    },
                    { key: 'save' }
                );
            });
            await flush();

            expect(result.current.queued).toBe(2);

            await act(async () => {
                gate.resolve();
            });
            await waitFor(() => expect(ran).toEqual(['first', 'second']));
        });

        it('never replaces a task that already started', async () => {
            const gate = deferred();
            const ran: string[] = [];
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                void result.current.enqueue(
                    async () => {
                        ran.push('running');
                        await gate.promise;
                    },
                    { key: 'save', replace: true }
                );
            });
            await flush();

            act(() => {
                void result.current.enqueue(
                    async () => {
                        ran.push('next');
                    },
                    { key: 'save', replace: true }
                );
            });
            await flush();

            expect(result.current.running).toBe(1);

            await act(async () => {
                gate.resolve();
            });
            await waitFor(() => expect(ran).toEqual(['running', 'next']));
        });

        it('gives the replacement the newcomer place in line', async () => {
            const gate = deferred();
            const ran: string[] = [];
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                void result.current.enqueue(() => gate.promise);
                void result.current.enqueue(
                    async () => {
                        ran.push('stale-save');
                    },
                    { key: 'save', replace: true }
                );
                void result.current.enqueue(async () => {
                    ran.push('other');
                });
                void result.current.enqueue(
                    async () => {
                        ran.push('fresh-save');
                    },
                    { key: 'save', replace: true }
                );
            });
            await flush();

            await act(async () => {
                gate.resolve();
            });
            await waitFor(() => expect(ran).toHaveLength(2));

            expect(ran).toEqual(['other', 'fresh-save']);
        });

        it('does not report a replaced or cancelled task to onError', async () => {
            const onError = vi.fn();
            const gate = deferred();
            const boom = new Error('nope');
            const { result } = renderHook(() => useAsyncQueue(undefined, { onError }));

            act(() => {
                void result.current.enqueue(() => gate.promise);
                void result.current.enqueue(async () => 'stale', { key: 'save', replace: true });
                void result.current.enqueue(async () => 'fresh', { key: 'save', replace: true });
                void result.current.enqueue(async () => 'never', { key: 'draft' });
                void result.current.enqueue(async () => {
                    throw boom;
                });
            });
            await flush();

            act(() => {
                result.current.cancel('draft');
            });

            await act(async () => {
                gate.resolve();
            });
            await waitFor(() => expect(onError).toHaveBeenCalledWith(boom));

            expect(onError).toHaveBeenCalledTimes(1);
        });

        it('does not spray unhandled rejections over replaced fire-and-forget saves', async () => {
            const unhandled = vi.fn();
            const nodeProcess = (globalThis as { process?: NodeProcessLike }).process;

            expect(nodeProcess).toBeDefined();
            nodeProcess?.on('unhandledRejection', unhandled);

            const gate = deferred();
            const { result } = renderHook(() => useAsyncQueue());

            act(() => {
                void result.current.enqueue(() => gate.promise);
                void result.current.enqueue(async () => 'stale', { key: 'save', replace: true });
                void result.current.enqueue(async () => 'fresh', { key: 'save', replace: true });
            });

            await act(async () => {
                gate.resolve();
            });
            await new Promise(resolve => setTimeout(resolve, 20));

            expect(unhandled).not.toHaveBeenCalled();
            nodeProcess?.off('unhandledRejection', unhandled);
        });

        describe('cancel', () => {
            it('drops only the waiting tasks under that key', async () => {
                const gate = deferred();
                const ran: string[] = [];
                const { result } = renderHook(() => useAsyncQueue());

                act(() => {
                    void result.current.enqueue(() => gate.promise);
                    void result.current.enqueue(
                        async () => {
                            ran.push('draft-a');
                        },
                        { key: 'draft' }
                    );
                    void result.current.enqueue(
                        async () => {
                            ran.push('draft-b');
                        },
                        { key: 'draft' }
                    );
                    void result.current.enqueue(async () => {
                        ran.push('unkeyed');
                    });
                });
                await flush();

                let dropped = 0;
                act(() => {
                    dropped = result.current.cancel('draft');
                });

                expect(dropped).toBe(2);
                expect(result.current.queued).toBe(1);

                await act(async () => {
                    gate.resolve();
                });
                await waitFor(() => expect(ran).toEqual(['unkeyed']));
            });

            it('rejects cancelled tasks with an AsyncQueueClearedError', async () => {
                const gate = deferred();
                const { result } = renderHook(() => useAsyncQueue());

                let rejection: unknown;
                act(() => {
                    void result.current.enqueue(() => gate.promise);
                    result.current
                        .enqueue(async () => 'never', { key: 'draft' })
                        .catch(error => {
                            rejection = error;
                        });
                });
                await flush();

                act(() => {
                    result.current.cancel('draft');
                });
                await flush();

                expect(rejection).toBeInstanceOf(AsyncQueueClearedError);

                await act(async () => {
                    gate.resolve();
                });
                await flush();
            });

            it('returns 0 when no waiting task carries that key', async () => {
                const { result } = renderHook(() => useAsyncQueue());

                let dropped = -1;
                act(() => {
                    dropped = result.current.cancel('nothing');
                });

                expect(dropped).toBe(0);
                expect(result.current.status).toBe('idle');
            });
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

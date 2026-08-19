import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
    cleanup();
});

type Listener = (ev: MessageEvent) => void;

const channels = new Map<string, Set<PolyfillBroadcastChannel>>();

class PolyfillBroadcastChannel {
    name: string;
    onmessage: Listener | null = null;
    private closed = false;

    constructor(name: string) {
        this.name = name;
        let set = channels.get(name);
        if (!set) {
            set = new Set();
            channels.set(name, set);
        }
        set.add(this);
    }

    postMessage(data: unknown): void {
        if (this.closed) throw new Error('Channel is closed');

        const peers = channels.get(this.name);

        if (!peers) return;

        for (const peer of peers) {
            if (peer === this || peer.closed) continue;

            queueMicrotask(() => {
                peer.onmessage?.({ data } as MessageEvent);
            });
        }
    }

    close(): void {
        this.closed = true;
        channels.get(this.name)?.delete(this);
    }

    addEventListener(type: string, listener: Listener): void {
        if (type === 'message') this.onmessage = listener;
    }

    removeEventListener(type: string): void {
        if (type === 'message') this.onmessage = null;
    }
}

if (typeof globalThis.BroadcastChannel === 'undefined') {
    (globalThis as Record<string, unknown>).BroadcastChannel = PolyfillBroadcastChannel;
}

interface QueueEntry {
    start: () => void;
    signal?: AbortSignal;
    onAbort?: () => void;
    ifAvailable?: boolean;
    startUnavailable?: () => void;
}

class PolyfillLockManager {
    private queues = new Map<string, QueueEntry[]>();
    private held = new Set<string>();

    request(name: string, ...args: unknown[]): Promise<unknown> {
        const hasOptions = typeof args[0] !== 'function';
        const options = (hasOptions ? args[0] : {}) as {
            signal?: AbortSignal;
            ifAvailable?: boolean;
        };
        const callback = (hasOptions ? args[1] : args[0]) as (
            lock: { name: string; mode: string } | null
        ) => unknown;
        const signal = options.signal;
        const ifAvailable = options.ifAvailable === true;

        return new Promise((resolve, reject) => {
            const abortError = () => {
                const err = new Error('The request was aborted.');
                err.name = 'AbortError';
                return err;
            };

            if (signal?.aborted) {
                reject(abortError());
                return;
            }

            const entry: QueueEntry = {
                signal,
                ifAvailable,
                start: () => {
                    queueMicrotask(() => {
                        Promise.resolve(callback({ name, mode: 'exclusive' }))
                            .then(resolve, reject)
                            .finally(() => this.release(name));
                    });
                },
                startUnavailable: () => {
                    queueMicrotask(() => {
                        Promise.resolve(callback(null)).then(resolve, reject);
                    });
                },
            };

            if (signal) {
                entry.onAbort = () => {
                    const queue = this.queues.get(name);
                    const idx = queue?.indexOf(entry) ?? -1;

                    if (idx !== -1) {
                        queue?.splice(idx, 1);
                        reject(abortError());
                    }
                };
                signal.addEventListener('abort', entry.onAbort);
            }

            const queue = this.queues.get(name) ?? [];
            this.queues.set(name, queue);
            queue.push(entry);
            this.pump(name);
        });
    }

    private pump(name: string): void {
        const queue = this.queues.get(name);

        if (!queue) return;

        while (queue.length > 0) {
            const entry = queue[0]!;

            if (this.held.has(name)) {
                if (!entry.ifAvailable) return;

                queue.shift();
                entry.startUnavailable?.();
                continue;
            }

            queue.shift();
            this.held.add(name);
            entry.start();

            return;
        }
    }

    private release(name: string): void {
        this.held.delete(name);
        this.pump(name);
    }
}

if (typeof navigator !== 'undefined' && typeof navigator.locks === 'undefined') {
    Object.defineProperty(navigator, 'locks', {
        value: new PolyfillLockManager(),
        configurable: true,
        writable: true,
    });
}

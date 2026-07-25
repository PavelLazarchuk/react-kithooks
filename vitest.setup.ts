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

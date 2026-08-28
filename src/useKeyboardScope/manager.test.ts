import { afterEach, describe, expect, it, vi } from 'vitest';

import { KeyboardScopeManager } from './manager';

function keydown(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
}

describe('KeyboardScopeManager', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('registering a scope is a no-op when the resolved target is null', () => {
        const manager = new KeyboardScopeManager(() => null);
        const handler = vi.fn();

        const { entry, unregister } = manager.register({
            priority: 0,
            passthrough: false,
            getBindings: () => ({ a: handler }),
            getOnEscape: () => undefined,
        });

        expect(manager.isTopMost(entry)).toBe(true);
        expect(() => unregister()).not.toThrow();
    });

    it('does nothing when there are no registered scopes', () => {
        const target = document.createElement('div');
        document.body.appendChild(target);
        const manager = new KeyboardScopeManager(() => target);

        const { unregister } = manager.register({
            priority: 0,
            passthrough: false,
            getBindings: () => ({}),
            getOnEscape: () => undefined,
        });

        unregister();

        expect(() => target.dispatchEvent(keydown('a'))).not.toThrow();
    });

    it('the internal keydown handler is a no-op when called with zero registered scopes', () => {
        const manager = new KeyboardScopeManager(() => null);
        const internal = manager as unknown as { handleKeydown: (e: KeyboardEvent) => void };

        expect(() => internal.handleKeydown(keydown('a'))).not.toThrow();
    });

    it('destroy() clears all entries, detaches, and notifies subscribers', () => {
        const target = document.createElement('div');
        document.body.appendChild(target);
        const manager = new KeyboardScopeManager(() => target);
        const handler = vi.fn();
        const listener = vi.fn();

        manager.register({
            priority: 0,
            passthrough: false,
            getBindings: () => ({ a: handler }),
            getOnEscape: () => undefined,
        });
        manager.subscribe(listener);

        manager.destroy();

        expect(listener).toHaveBeenCalled();
        target.dispatchEvent(keydown('a'));
        expect(handler).not.toHaveBeenCalled();
    });
});

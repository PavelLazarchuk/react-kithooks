import { createListenerSet } from './listenerSet';

export interface LazyStore {
    subscribe: (listener: () => void) => () => void;
    notify: () => void;
    readonly size: number;
}

export function createLazyStore(onActivate: () => void, onDeactivate: () => void): LazyStore {
    const listeners = createListenerSet();

    return {
        subscribe: listener => {
            const wasEmpty = listeners.size === 0;
            const unsubscribe = listeners.add(listener);

            if (wasEmpty) onActivate();

            return () => {
                unsubscribe();

                if (listeners.size === 0) onDeactivate();
            };
        },
        notify: listeners.notify,
        get size() {
            return listeners.size;
        },
    };
}

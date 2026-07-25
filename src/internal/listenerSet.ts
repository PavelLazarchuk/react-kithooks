export interface ListenerSet {
    add: (listener: () => void) => () => void;
    notify: () => void;
    readonly size: number;
}

export function createListenerSet(): ListenerSet {
    const listeners = new Set<() => void>();

    return {
        add: listener => {
            listeners.add(listener);

            return () => listeners.delete(listener);
        },
        notify: () => {
            for (const listener of listeners) listener();
        },
        get size() {
            return listeners.size;
        },
    };
}

import {
    createContext,
    createElement,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';

import { getDefaultManager, KeyboardScopeManager } from './manager';
import type { KeyBindings, KeyBindingOptions, KeyBindingValue, KeyHandler } from './manager';

export type { KeyBindings, KeyBindingOptions, KeyBindingValue, KeyHandler };

export interface UseKeyboardScopeOptions {
    active?: boolean;
    passthrough?: boolean;
    priority?: number;
    onEscape?: () => void;
}

export interface UseKeyboardScopeReturn {
    isTopMost: boolean;
}

const KeyboardScopeContext = createContext<KeyboardScopeManager | null>(null);

export interface KeyboardScopeProviderProps {
    target?: EventTarget;
    children?: ReactNode;
}

/**
 * Optional — the hook works without a provider via a module-level default
 * manager on `document`. Use the provider for isolation: multiple React roots,
 * shadow DOM, or a custom event target.
 */
export function KeyboardScopeProvider(props: KeyboardScopeProviderProps) {
    const { target, children } = props;

    const manager = useMemo(
        () => new KeyboardScopeManager(target ? () => target : undefined),
        [target]
    );

    useEffect(() => () => manager.destroy(), [manager]);

    return createElement(KeyboardScopeContext.Provider, { value: manager }, children);
}

/**
 * Stack-based keyboard shortcut scoping for layered UI.
 *
 *   useKeyboardScope({ 'mod+k': openPalette, Escape: close })
 *
 * The most recently activated scope is top-most; scopes below it are suspended
 * unless it opts into `passthrough`. Escape is only ever offered to the
 * top-most scope.
 */
export function useKeyboardScope(
    bindings: KeyBindings,
    options: UseKeyboardScopeOptions = {}
): UseKeyboardScopeReturn {
    const { active = true, passthrough = false, priority = 0 } = options;

    const contextManager = useContext(KeyboardScopeContext);
    const manager = contextManager ?? getDefaultManager();

    const bindingsRef = useRef(bindings);
    bindingsRef.current = bindings;
    const onEscapeRef = useRef(options.onEscape);
    onEscapeRef.current = options.onEscape;

    const entryRef = useRef<object | null>(null);

    useEffect(() => {
        if (!active) return;

        const { entry, unregister } = manager.register({
            priority,
            passthrough,
            getBindings: () => bindingsRef.current,
            getOnEscape: () => onEscapeRef.current,
        });
        entryRef.current = entry;
        manager.notify();

        return () => {
            entryRef.current = null;
            unregister();
        };
    }, [manager, active, passthrough, priority]);

    const isTopMost = useSyncExternalStore(
        manager.subscribe,
        () => entryRef.current !== null && manager.isTopMost(entryRef.current),
        () => false
    );

    return { isTopMost };
}

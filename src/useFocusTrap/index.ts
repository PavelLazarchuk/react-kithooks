import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { RefCallback } from 'react';

import { focusElement, getFocusTrapManager } from './manager';
import type { FocusTarget } from './manager';

export type { FocusTarget };

export interface UseFocusTrapOptions {
    active?: boolean;
    initialFocus?: FocusTarget | false;
    returnFocus?: FocusTarget | boolean;
    priority?: number;
    preventScroll?: boolean;
}

export interface UseFocusTrapReturn<T extends HTMLElement = HTMLDivElement> {
    ref: RefCallback<T>;
    isActive: boolean;
}

function resolveReturnTarget(
    option: FocusTarget | boolean | undefined,
    doc: Document,
    previous: HTMLElement | null
): HTMLElement | null {
    if (option === false) return null;
    if (option === undefined || option === true) return previous;
    if (typeof option === 'string') return doc.querySelector<HTMLElement>(option);
    if (typeof option === 'function') return option();

    return option;
}

function restoreFocus(target: HTMLElement | null, doc: Document, preventScroll: boolean): void {
    if (!target || !target.isConnected) return;

    focusElement(target, preventScroll);

    setTimeout(() => {
        const active = doc.activeElement;

        if (active && active !== doc.body) return;
        if (!target.isConnected) return;

        focusElement(target, preventScroll);
    }, 0);
}

/**
 * Confines Tab to one container and hands focus back when it closes.
 *
 *   const { ref } = useFocusTrap();
 *   <div ref={ref} role="dialog">…</div>
 *
 * Traps stack the same way `useKeyboardScope` stacks shortcuts: the most
 * recently activated trap owns focus and suspends the ones below it, so a
 * dialog opened from a dialog behaves. Focus wrapping runs on real sentinel
 * nodes in the browser's own tab order rather than on intercepted keydowns, so
 * content that becomes focusable later is picked up automatically.
 *
 * Escape is deliberately not handled here — pair it with `useKeyboardScope`.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
    options: UseFocusTrapOptions = {}
): UseFocusTrapReturn<T> {
    const { active = true, priority = 0 } = options;

    const manager = getFocusTrapManager();
    const optionsRef = useRef(options);
    optionsRef.current = options;

    const [container, setContainer] = useState<T | null>(null);
    const entryRef = useRef<object | null>(null);

    const ref = useCallback<RefCallback<T>>(node => {
        setContainer(node);
    }, []);

    useEffect(() => {
        if (!active || !container) return;

        const doc = container.ownerDocument;
        const previouslyFocused = doc.activeElement;
        const restoreTo = previouslyFocused instanceof HTMLElement ? previouslyFocused : null;

        const { entry, unregister } = manager.register({
            priority,
            container,
            getPreventScroll: () => optionsRef.current.preventScroll ?? false,
        });

        entryRef.current = entry;
        manager.notify();
        manager.focusInitial(entry, optionsRef.current.initialFocus);

        return () => {
            entryRef.current = null;
            unregister();

            const { returnFocus, preventScroll = false } = optionsRef.current;

            restoreFocus(resolveReturnTarget(returnFocus, doc, restoreTo), doc, preventScroll);
        };
    }, [manager, active, container, priority]);

    const isActive = useSyncExternalStore(
        manager.subscribe,
        () => entryRef.current !== null && manager.isTopMost(entryRef.current),
        () => false
    );

    return { ref, isActive };
}

import { useCallback, useEffect, useState } from 'react';
import type { RefCallback } from 'react';

import { lockScroll } from './manager';
import type { LockStrategy } from './manager';

export type { LockStrategy };

export interface UseLockBodyScrollOptions {
    strategy?: LockStrategy;
    gutter?: boolean;
    inert?: boolean;
}

export interface UseLockBodyScrollReturn<T extends HTMLElement = HTMLDivElement> {
    ref: RefCallback<T>;
    isLocked: boolean;
}

export function useLockBodyScroll<T extends HTMLElement = HTMLDivElement>(
    locked = true,
    options: UseLockBodyScrollOptions = {}
): UseLockBodyScrollReturn<T> {
    const { strategy = 'auto', gutter = true, inert = false } = options;

    const [container, setContainer] = useState<T | null>(null);
    const [isLocked, setIsLocked] = useState(false);

    const ref = useCallback<RefCallback<T>>(node => {
        setContainer(node);
    }, []);

    const target = inert ? container : null;

    useEffect(() => {
        if (!locked || typeof document === 'undefined') return;
        if (inert && !target) return;

        const handle = lockScroll(document, { strategy, gutter, inert, container: target });

        setIsLocked(true);

        return () => {
            handle.release();
            setIsLocked(false);
        };
    }, [locked, strategy, gutter, inert, target]);

    return { ref, isLocked };
}

import type { DependencyList } from 'react';
import { useRef } from 'react';

import { isDev } from './isDev';

/**
 * Warns in development when a hook's `deps` array changes length between
 * renders. React only compares entries up to the shorter array, so a
 * conditionally built deps list silently stops re-running on the entries it
 * can no longer see — a bug that looks like "the hook just doesn't fire".
 */
export function useDepsLengthWarning(hookName: string, deps: DependencyList): void {
    const lengthRef = useRef(deps.length);

    if (isDev && lengthRef.current !== deps.length) {
        console.warn(
            `[react-kithooks] ${hookName}: the deps array changed length ` +
                `(${lengthRef.current} → ${deps.length}). It must be the same length on ` +
                `every render — build it unconditionally and use a stable placeholder ` +
                `(null/undefined) instead of adding or removing entries.`
        );
        lengthRef.current = deps.length;
    }
}

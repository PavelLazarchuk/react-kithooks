import { useRef } from 'react';

/**
 * The previous DISTINCT value — what `value` was before it last changed
 * (compared with `Object.is`), or `undefined` before the first change.
 *
 * The classic `useEffect(() => { ref.current = value })` version overwrites
 * the ref on EVERY commit, so after any unrelated re-render "previous"
 * equals the current value and comparisons like `prev !== value` silently
 * stop working. This version only advances when the value actually changes.
 */
export function usePreviousValue<T>(value: T): T | undefined {
    const ref = useRef<{ value: T; prev: T | undefined }>({ value, prev: undefined });

    const current = ref.current;

    if (!Object.is(current.value, value)) {
        ref.current = { value, prev: current.value };
    }

    return ref.current.prev;
}

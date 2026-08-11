import { useRef } from 'react';

/**
 * The previous DISTINCT value — what `value` was before it last changed, or
 * `undefined` before the first change.
 *
 * The classic `useEffect(() => { ref.current = value })` version overwrites
 * the ref on EVERY commit, so after any unrelated re-render "previous"
 * equals the current value and comparisons like `prev !== value` silently
 * stop working. This version only advances when the value actually changes.
 *
 * Changes are detected with `Object.is` by default, which is the wrong
 * question to ask about an object rebuilt every render: a fresh `{...}` with
 * identical contents is a new reference, so "previous" would advance on every
 * pass and always equal the current value — the exact failure this hook
 * exists to prevent. Pass `isEqual` (a deep-equal, or a comparison of the one
 * field you care about) to compare by content instead.
 */
export function usePreviousValue<T>(
    value: T,
    isEqual: (previous: T, next: T) => boolean = Object.is
): T | undefined {
    const ref = useRef<{ value: T; prev: T | undefined }>({ value, prev: undefined });

    const current = ref.current;

    if (!isEqual(current.value, value)) {
        ref.current = { value, prev: current.value };
    }

    return ref.current.prev;
}

import { useEffect, useRef, useState } from 'react';

/**
 * Returns `value`, but updates only after it has stopped changing for
 * `delayMs`. The pending update is cancelled when the value reverts to the
 * currently returned one within the window (type-and-undo produces no
 * update at all) and when the component unmounts (no setState after
 * unmount).
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value);
    const debouncedRef = useRef(debounced);

    useEffect(() => {
        if (Object.is(debouncedRef.current, value)) return;

        const timer = setTimeout(() => {
            debouncedRef.current = value;
            setDebounced(value);
        }, delayMs);

        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return debounced;
}

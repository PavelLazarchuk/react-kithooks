import { useLayoutEffect, useRef } from 'react';

/**
 * True while the component is in its initial render pass, false on every
 * render after mount.
 * The common implementation flips a ref DURING the first render — under
 * StrictMode's dev double-render the second pass then reports `false`,
 * so dev and prod behave differently (an intro animation skipped only in
 * dev, an "on change" effect firing on mount only in dev). Flipping in a
 * layout effect instead keeps every pre-mount render pass consistently
 * `true`, and — unlike a passive effect — is guaranteed to run before any
 * layout-effect-triggered re-render elsewhere in the same commit.
 */
export function useIsFirstRender(): boolean {
    const isFirst = useRef(true);

    useLayoutEffect(() => {
        isFirst.current = false;
    }, []);

    return isFirst.current;
}

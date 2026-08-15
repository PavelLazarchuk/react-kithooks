import { useMediaQuery } from '../useMediaQuery';

export interface UsePrefersReducedMotionOptions {
    serverFallback?: boolean;
}

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the user has asked the system to minimize non-essential motion —
 * `(prefers-reduced-motion: reduce)`, read through useMediaQuery, so it is
 * SSR-safe and hydration-safe.
 *
 * The setting is an accessibility request, not a preference: for some users
 * parallax and large transitions cause actual nausea. Honor it by cutting the
 * motion, not the information — swap a slide for a fade or an instant state
 * change, and keep whatever the animation was communicating.
 */
export function usePrefersReducedMotion(options?: UsePrefersReducedMotionOptions): boolean {
    return useMediaQuery(QUERY, options);
}

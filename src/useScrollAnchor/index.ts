import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefCallback } from 'react';

import { anchoredScrollTop, clampScrollTop, isNearBottom } from './math';

export interface UseScrollAnchorOptions {
    bottomThreshold?: number;
    behavior?: ScrollBehavior;
    observeResize?: boolean;
    initialScrollToBottom?: boolean;
    disabled?: boolean;
}

export interface UseScrollAnchorReturn<T extends HTMLElement = HTMLDivElement> {
    ref: RefCallback<T>;
    isAtBottom: boolean;
    prepend: (mutate: () => void) => void;
    scrollToBottom: (opts?: { behavior?: ScrollBehavior }) => void;
}

interface PendingAnchor {
    el: Element | null;
    viewportOffset: number;
    prevScrollHeight: number;
}

const SETTLE_WINDOW_MS = 2000;
const PENDING_TIMEOUT_MS = 1000;
const SMOOTH_SCROLL_MAX_MS = 1000;

function prefersReducedMotion(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
}

export function useScrollAnchor<T extends HTMLElement = HTMLDivElement>(
    options: UseScrollAnchorOptions = {}
): UseScrollAnchorReturn<T> {
    const [isAtBottom, setIsAtBottom] = useState(true);

    const optsRef = useRef(options);
    optsRef.current = options;

    const elRef = useRef<T | null>(null);
    const atBottomRef = useRef(true);
    const programmaticTopRef = useRef<number | null>(null);
    const pendingRef = useRef<PendingAnchor | null>(null);
    const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const settleAnchorRef = useRef<PendingAnchor | null>(null);
    const settleUntilRef = useRef(0);
    const smoothScrollUntilRef = useRef(0);
    const cleanupRef = useRef<(() => void) | null>(null);

    const setScrollTopProgrammatically = useCallback((el: HTMLElement, top: number) => {
        const target = clampScrollTop({
            scrollTop: top,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
        });

        if (Math.abs(el.scrollTop - target) < 1) return;

        programmaticTopRef.current = target;
        el.scrollTop = target;
    }, []);

    const updateAtBottom = useCallback(() => {
        const el = elRef.current;

        if (!el) return;

        const threshold = optsRef.current.bottomThreshold ?? 40;
        const next = isNearBottom(el, threshold);

        if (next !== atBottomRef.current) {
            atBottomRef.current = next;
            setIsAtBottom(next);
        }
    }, []);

    const scrollToBottom = useCallback(
        (opts?: { behavior?: ScrollBehavior }) => {
            const el = elRef.current;

            if (!el) return;

            const requested = opts?.behavior ?? optsRef.current.behavior ?? 'auto';
            const behavior = requested === 'smooth' && prefersReducedMotion() ? 'auto' : requested;
            const top = el.scrollHeight - el.clientHeight;

            if (behavior === 'smooth' && typeof el.scrollTo === 'function') {
                smoothScrollUntilRef.current = Date.now() + SMOOTH_SCROLL_MAX_MS;
                el.scrollTo({ top, behavior });
            } else {
                setScrollTopProgrammatically(el, top);
            }

            atBottomRef.current = true;
            setIsAtBottom(true);
        },
        [setScrollTopProgrammatically]
    );

    const cancelSettleWindow = useCallback(() => {
        settleUntilRef.current = 0;
        settleAnchorRef.current = null;
    }, []);

    const reanchor = useCallback(
        (el: HTMLElement, anchor: PendingAnchor): boolean => {
            if (!anchor.el || !el.contains(anchor.el)) return false;

            const target = anchoredScrollTop(
                (anchor.el as HTMLElement).offsetTop,
                anchor.viewportOffset
            );
            setScrollTopProgrammatically(el, target);

            return true;
        },
        [setScrollTopProgrammatically]
    );

    const handleMutations = useCallback(() => {
        const el = elRef.current;

        if (!el) return;

        const pending = pendingRef.current;

        if (pending) {
            pendingRef.current = null;

            if (pendingTimerRef.current !== null) {
                clearTimeout(pendingTimerRef.current);
                pendingTimerRef.current = null;
            }
            if (!reanchor(el, pending)) {
                const delta = el.scrollHeight - pending.prevScrollHeight;

                if (delta !== 0) setScrollTopProgrammatically(el, el.scrollTop + delta);
            }

            settleAnchorRef.current = pending;
            settleUntilRef.current = Date.now() + SETTLE_WINDOW_MS;
        } else if (atBottomRef.current && !optsRef.current.disabled) {
            scrollToBottom();
        }

        updateAtBottom();
    }, [reanchor, scrollToBottom, setScrollTopProgrammatically, updateAtBottom]);

    const handleContentResize = useCallback(() => {
        const el = elRef.current;

        if (!el || optsRef.current.disabled) return;

        const settleAnchor = settleAnchorRef.current;

        if (settleAnchor && Date.now() < settleUntilRef.current) {
            reanchor(el, settleAnchor);
        } else if (atBottomRef.current) {
            scrollToBottom();
        }

        updateAtBottom();
    }, [reanchor, scrollToBottom, updateAtBottom]);

    const ref = useCallback<RefCallback<T>>(
        node => {
            cleanupRef.current?.();
            cleanupRef.current = null;
            elRef.current = node;
            programmaticTopRef.current = null;

            if (!node) return;

            if ('overflowAnchor' in node.style) {
                node.style.overflowAnchor = 'none';
            }

            if (!optsRef.current.disabled && optsRef.current.initialScrollToBottom !== false) {
                node.scrollTop = node.scrollHeight - node.clientHeight;
            }

            updateAtBottom();

            const cleanups: Array<() => void> = [];

            const onScroll = () => {
                const programmaticTop = programmaticTopRef.current;

                if (programmaticTop !== null && Math.abs(node.scrollTop - programmaticTop) < 1) {
                    programmaticTopRef.current = null;
                    updateAtBottom();

                    return;
                }
                if (Date.now() < smoothScrollUntilRef.current) {
                    return;
                }

                programmaticTopRef.current = null;
                cancelSettleWindow();
                updateAtBottom();
            };

            const onUserIntent = () => {
                cancelSettleWindow();
            };

            node.addEventListener('scroll', onScroll, { passive: true });
            node.addEventListener('wheel', onUserIntent, { passive: true });
            node.addEventListener('touchstart', onUserIntent, { passive: true });
            node.addEventListener('keydown', onUserIntent);

            const mutationObserver =
                typeof MutationObserver !== 'undefined'
                    ? new MutationObserver(handleMutations)
                    : null;
            mutationObserver?.observe(node, { childList: true, subtree: true });

            let resizeObserver: ResizeObserver | null = null;
            const observedChildren = new Set<Element>();
            const syncResizeTargets = () => {
                if (!resizeObserver) return;

                const current = new Set<Element>(Array.from(node.children));

                for (const child of observedChildren) {
                    if (!current.has(child)) {
                        resizeObserver.unobserve(child);
                        observedChildren.delete(child);
                    }
                }
                for (const child of current) {
                    if (!observedChildren.has(child)) {
                        resizeObserver.observe(child);
                        observedChildren.add(child);
                    }
                }
            };

            if (optsRef.current.observeResize !== false && typeof ResizeObserver !== 'undefined') {
                resizeObserver = new ResizeObserver(handleContentResize);
                syncResizeTargets();
                const childSyncObserver = new MutationObserver(syncResizeTargets);
                childSyncObserver.observe(node, { childList: true });
                cleanups.push(() => childSyncObserver.disconnect());
            }

            cleanups.push(() => {
                node.removeEventListener('scroll', onScroll);
                node.removeEventListener('wheel', onUserIntent);
                node.removeEventListener('touchstart', onUserIntent);
                node.removeEventListener('keydown', onUserIntent);
                mutationObserver?.disconnect();
                resizeObserver?.disconnect();
            });

            cleanupRef.current = () => {
                for (const cleanup of cleanups) cleanup();
            };
        },
        [cancelSettleWindow, handleContentResize, handleMutations, updateAtBottom]
    );

    const prepend = useCallback((mutate: () => void) => {
        const el = elRef.current;

        if (!el || optsRef.current.disabled) {
            mutate();
            return;
        }

        const anchorEl = el.firstElementChild;
        pendingRef.current = {
            el: anchorEl,
            viewportOffset: anchorEl ? (anchorEl as HTMLElement).offsetTop - el.scrollTop : 0,
            prevScrollHeight: el.scrollHeight,
        };

        if (pendingTimerRef.current !== null) clearTimeout(pendingTimerRef.current);

        pendingTimerRef.current = setTimeout(() => {
            pendingRef.current = null;
            pendingTimerRef.current = null;
        }, PENDING_TIMEOUT_MS);

        mutate();
    }, []);

    useEffect(
        () => () => {
            if (pendingTimerRef.current !== null) clearTimeout(pendingTimerRef.current);
        },
        []
    );

    return { ref, isAtBottom, prepend, scrollToBottom };
}

export type { ScrollMetrics } from './math';

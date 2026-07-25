export interface ScrollMetrics {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
}

/** iOS overscroll bounce can report scrollTop < 0 or past the max — clamp before any math. */
export function clampScrollTop(metrics: ScrollMetrics): number {
    const max = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
    return Math.min(Math.max(metrics.scrollTop, 0), max);
}

export function distanceFromBottom(metrics: ScrollMetrics): number {
    return metrics.scrollHeight - clampScrollTop(metrics) - metrics.clientHeight;
}

/** 1px epsilon on top of the threshold — scrollTop is fractional on zoomed displays. */
export function isNearBottom(metrics: ScrollMetrics, threshold: number): boolean {
    return distanceFromBottom(metrics) <= threshold + 1;
}

/**
 * Scroll position that keeps an anchor element at the same viewport offset.
 * Invariant: anchorOffsetTop - scrollTop === viewportOffset (captured before the prepend).
 */
export function anchoredScrollTop(anchorOffsetTop: number, viewportOffset: number): number {
    return anchorOffsetTop - viewportOffset;
}

export type ThrottleInterval = number | 'frame';

const FRAME_FALLBACK_MS = 16;

export function scheduleThrottleWindow(interval: ThrottleInterval, run: () => void): () => void {
    if (interval === 'frame' && typeof requestAnimationFrame === 'function') {
        const frame = requestAnimationFrame(run);

        return () => cancelAnimationFrame(frame);
    }

    const timer = setTimeout(run, interval === 'frame' ? FRAME_FALLBACK_MS : interval);

    return () => clearTimeout(timer);
}

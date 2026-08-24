import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useScrollAnchor } from './index';
import { anchoredScrollTop, clampScrollTop, distanceFromBottom, isNearBottom } from './math';

describe('math', () => {
    it('clamps overscroll bounce (iOS) into the valid range', () => {
        expect(clampScrollTop({ scrollTop: -30, scrollHeight: 1000, clientHeight: 500 })).toBe(0);
        expect(clampScrollTop({ scrollTop: 800, scrollHeight: 1000, clientHeight: 500 })).toBe(500);
        expect(clampScrollTop({ scrollTop: 200, scrollHeight: 1000, clientHeight: 500 })).toBe(200);
        expect(clampScrollTop({ scrollTop: 10, scrollHeight: 300, clientHeight: 500 })).toBe(0);
    });

    it('computes distance from bottom', () => {
        expect(distanceFromBottom({ scrollTop: 500, scrollHeight: 1000, clientHeight: 500 })).toBe(
            0
        );
        expect(distanceFromBottom({ scrollTop: 0, scrollHeight: 1000, clientHeight: 500 })).toBe(
            500
        );
    });

    it('isNearBottom uses threshold plus a 1px epsilon for fractional scrollTop', () => {
        expect(isNearBottom({ scrollTop: 459.5, scrollHeight: 1000, clientHeight: 500 }, 40)).toBe(
            true
        );
        expect(isNearBottom({ scrollTop: 400, scrollHeight: 1000, clientHeight: 500 }, 40)).toBe(
            false
        );
        expect(isNearBottom({ scrollTop: 0, scrollHeight: 300, clientHeight: 500 }, 40)).toBe(true);
    });

    it('anchoredScrollTop maintains the viewport-offset invariant', () => {
        expect(anchoredScrollTop(300, 0)).toBe(300);
        expect(anchoredScrollTop(500, 120)).toBe(380);
    });
});

interface Scrollable {
    el: HTMLDivElement;
    setScrollHeight: (v: number) => void;
    scrollTop: () => number;
    setScrollTop: (v: number) => void;
}

function makeScrollable({
    scrollHeight = 1000,
    clientHeight = 500,
    scrollTop = 0,
} = {}): Scrollable {
    const el = document.createElement('div');
    document.body.appendChild(el);
    let top = scrollTop;
    let height = scrollHeight;
    Object.defineProperty(el, 'scrollTop', {
        get: () => top,
        set: (v: number) => {
            top = v;
        },
        configurable: true,
    });
    Object.defineProperty(el, 'scrollHeight', { get: () => height, configurable: true });
    Object.defineProperty(el, 'clientHeight', { get: () => clientHeight, configurable: true });
    return {
        el,
        setScrollHeight: v => {
            height = v;
        },
        scrollTop: () => top,
        setScrollTop: v => {
            top = v;
        },
    };
}

function addChild(el: HTMLElement, offsetTop: number): HTMLDivElement {
    const child = document.createElement('div');
    setOffsetTop(child, offsetTop);
    el.appendChild(child);
    return child;
}

function setOffsetTop(el: HTMLElement, offsetTop: number): void {
    Object.defineProperty(el, 'offsetTop', { get: () => offsetTop, configurable: true });
}

const flushMutations = () => act(async () => {});

describe('useScrollAnchor', () => {
    it('scrolls to bottom on mount and reports isAtBottom', () => {
        const box = makeScrollable();
        const { result } = renderHook(() => useScrollAnchor());
        act(() => result.current.ref(box.el));
        expect(box.scrollTop()).toBe(500);
        expect(result.current.isAtBottom).toBe(true);
    });

    it('flips isAtBottom on user scroll away from bottom', () => {
        const box = makeScrollable();
        const { result } = renderHook(() => useScrollAnchor());
        act(() => result.current.ref(box.el));

        box.setScrollTop(100);
        act(() => {
            box.el.dispatchEvent(new Event('scroll'));
        });
        expect(result.current.isAtBottom).toBe(false);

        box.setScrollTop(499.5);
        act(() => {
            box.el.dispatchEvent(new Event('scroll'));
        });
        expect(result.current.isAtBottom).toBe(true);
    });

    it('prepend keeps the anchor element at the same viewport offset', async () => {
        const box = makeScrollable({ scrollTop: 0 });
        const anchor = addChild(box.el, 0);
        const { result } = renderHook(() => useScrollAnchor({ initialScrollToBottom: false }));
        act(() => result.current.ref(box.el));
        box.setScrollTop(0);

        act(() => {
            result.current.prepend(() => {
                const older = document.createElement('div');
                box.el.insertBefore(older, anchor);
                setOffsetTop(anchor, 300);
                box.setScrollHeight(1300);
            });
        });
        await flushMutations();

        expect(box.scrollTop()).toBe(300);
    });

    it('falls back to scrollHeight diff when the anchor was removed by the update', async () => {
        const box = makeScrollable({ scrollTop: 50 });
        addChild(box.el, 0);
        const { result } = renderHook(() => useScrollAnchor({ initialScrollToBottom: false }));
        act(() => result.current.ref(box.el));
        box.setScrollTop(50);

        act(() => {
            result.current.prepend(() => {
                box.el.replaceChildren(document.createElement('div'));
                box.setScrollHeight(1400);
            });
        });
        await flushMutations();

        expect(box.scrollTop()).toBe(50 + 400);
    });

    it('sticks to bottom on append when already at bottom', async () => {
        const box = makeScrollable({ scrollTop: 500 });
        const { result } = renderHook(() => useScrollAnchor());
        act(() => result.current.ref(box.el));

        act(() => {
            box.setScrollHeight(1200);
            box.el.appendChild(document.createElement('div'));
        });
        await flushMutations();

        expect(box.scrollTop()).toBe(700);
        expect(result.current.isAtBottom).toBe(true);
    });

    it('does not steal scroll on append when the user scrolled up', async () => {
        const box = makeScrollable();
        const { result } = renderHook(() => useScrollAnchor());
        act(() => result.current.ref(box.el));

        box.setScrollTop(100);
        act(() => {
            box.el.dispatchEvent(new Event('scroll'));
        });
        expect(result.current.isAtBottom).toBe(false);

        act(() => {
            box.setScrollHeight(1200);
            box.el.appendChild(document.createElement('div'));
        });
        await flushMutations();

        expect(box.scrollTop()).toBe(100);
    });

    it('scrollToBottom scrolls and reports isAtBottom', () => {
        const box = makeScrollable();
        const { result } = renderHook(() => useScrollAnchor({ initialScrollToBottom: false }));
        act(() => result.current.ref(box.el));
        box.setScrollTop(0);

        act(() => result.current.scrollToBottom());
        expect(box.scrollTop()).toBe(500);
        expect(result.current.isAtBottom).toBe(true);
    });

    it('does nothing when disabled', async () => {
        const box = makeScrollable({ scrollTop: 500 });
        const { result } = renderHook(() => useScrollAnchor({ disabled: true }));
        act(() => result.current.ref(box.el));

        act(() => {
            box.setScrollHeight(1200);
            box.el.appendChild(document.createElement('div'));
        });
        await flushMutations();
        expect(box.scrollTop()).toBe(500);
    });

    it('disabled becoming false after mount re-enables auto-scroll without remounting', async () => {
        const box = makeScrollable({ scrollTop: 500 });
        const { result, rerender } = renderHook(
            ({ disabled }: { disabled: boolean }) => useScrollAnchor({ disabled }),
            { initialProps: { disabled: true } }
        );
        act(() => result.current.ref(box.el));

        rerender({ disabled: false });

        act(() => {
            box.setScrollHeight(1200);
            box.el.appendChild(document.createElement('div'));
        });
        await flushMutations();

        expect(box.scrollTop()).toBe(700);
    });

    describe('reduced motion', () => {
        function stubMatchMedia(prefersReduce: boolean) {
            Object.defineProperty(window, 'matchMedia', {
                configurable: true,
                writable: true,
                value: (query: string) => ({
                    matches: prefersReduce && query.includes('prefers-reduced-motion'),
                    media: query,
                    addEventListener: () => undefined,
                    removeEventListener: () => undefined,
                }),
            });
        }

        afterEach(() => {
            Reflect.deleteProperty(window, 'matchMedia');
        });

        it('animates a smooth scroll when motion is fine', () => {
            stubMatchMedia(false);
            const box = makeScrollable({ scrollTop: 0 });
            const scrollTo = vi.fn();
            box.el.scrollTo = scrollTo as unknown as typeof box.el.scrollTo;

            const { result } = renderHook(() => useScrollAnchor({ initialScrollToBottom: false }));
            act(() => result.current.ref(box.el));
            act(() => result.current.scrollToBottom({ behavior: 'smooth' }));

            expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: 'smooth' });
        });

        it('lets a wheel during the smooth-scroll window release the bottom lock', () => {
            stubMatchMedia(false);
            const box = makeScrollable({ scrollTop: 500 });
            box.el.scrollTo = vi.fn() as unknown as typeof box.el.scrollTo;

            const { result } = renderHook(() => useScrollAnchor({ initialScrollToBottom: false }));
            act(() => result.current.ref(box.el));
            act(() => result.current.scrollToBottom({ behavior: 'smooth' }));
            expect(result.current.isAtBottom).toBe(true);

            act(() => {
                box.setScrollTop(0);
                box.el.dispatchEvent(new Event('wheel'));
                box.el.dispatchEvent(new Event('scroll'));
            });

            expect(result.current.isAtBottom).toBe(false);
        });

        it('jumps instantly instead when the reader asked for reduced motion', () => {
            stubMatchMedia(true);
            const box = makeScrollable({ scrollTop: 0 });
            const scrollTo = vi.fn();
            box.el.scrollTo = scrollTo as unknown as typeof box.el.scrollTo;

            const { result } = renderHook(() => useScrollAnchor({ initialScrollToBottom: false }));
            act(() => result.current.ref(box.el));
            act(() => result.current.scrollToBottom({ behavior: 'smooth' }));

            expect(scrollTo).not.toHaveBeenCalled();
            expect(box.scrollTop()).toBe(500);
            expect(result.current.isAtBottom).toBe(true);
        });
    });

    it('releases the anchor on a user scroll that follows an unreported programmatic one', async () => {
        const resizeCallbacks: ResizeObserverCallback[] = [];
        class StubResizeObserver {
            constructor(callback: ResizeObserverCallback) {
                resizeCallbacks.push(callback);
            }
            observe() {}
            unobserve() {}
            disconnect() {}
        }
        vi.stubGlobal('ResizeObserver', StubResizeObserver);

        try {
            const box = makeScrollable({ scrollTop: 0 });
            const anchor = addChild(box.el, 0);
            const { result } = renderHook(() => useScrollAnchor({ initialScrollToBottom: false }));
            act(() => result.current.ref(box.el));
            box.setScrollTop(0);

            act(() => result.current.scrollToBottom());
            box.setScrollHeight(1200);
            act(() => result.current.scrollToBottom());
            act(() => {
                box.el.dispatchEvent(new Event('scroll'));
            });

            act(() => {
                result.current.prepend(() => {
                    box.el.insertBefore(document.createElement('div'), anchor);
                    setOffsetTop(anchor, 300);
                    box.setScrollHeight(1500);
                });
            });
            await flushMutations();

            box.setScrollTop(50);
            act(() => {
                box.el.dispatchEvent(new Event('scroll'));
            });

            act(() => {
                for (const callback of resizeCallbacks) {
                    callback([], {} as ResizeObserver);
                }
            });

            expect(box.scrollTop()).toBe(50);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('clears the pending anchor timer when the component unmounts', () => {
        vi.useFakeTimers();
        try {
            const box = makeScrollable();
            const { result, unmount } = renderHook(() => useScrollAnchor());
            act(() => result.current.ref(box.el));
            act(() => result.current.prepend(() => undefined));

            unmount();

            expect(vi.getTimerCount()).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it('detaches listeners when the container unmounts (callback ref null)', () => {
        const box = makeScrollable();
        const { result } = renderHook(() => useScrollAnchor());
        act(() => result.current.ref(box.el));
        act(() => result.current.ref(null));

        box.setScrollTop(0);
        act(() => {
            box.el.dispatchEvent(new Event('scroll'));
        });
        expect(result.current.isAtBottom).toBe(true);
    });
});

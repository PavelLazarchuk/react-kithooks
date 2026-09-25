import { act, cleanup, render } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLockBodyScroll } from './index';
import type { UseLockBodyScrollOptions } from './index';

function Dialog({ locked, options }: { locked?: boolean; options?: UseLockBodyScrollOptions }) {
    const { ref, isLocked } = useLockBodyScroll<HTMLDivElement>(locked, options);

    return (
        <div ref={ref} data-testid="dialog">
            {String(isLocked)}
        </div>
    );
}

function widen(gap: number) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(document.documentElement, 'clientWidth', {
        configurable: true,
        value: 1000 - gap,
    });
}

describe('useLockBodyScroll', () => {
    beforeEach(() => {
        document.body.style.cssText = '';
        widen(0);
    });

    afterEach(() => {
        cleanup();
        document.body.style.cssText = '';
        vi.restoreAllMocks();
    });

    it('freezes the page while it is locked and lets it go after', () => {
        const view = render(<Dialog />);

        expect(document.body.style.overflow).toBe('hidden');

        view.unmount();

        expect(document.body.style.overflow).toBe('');
    });

    it('does nothing at all when it is not locked', () => {
        render(<Dialog locked={false} />);

        expect(document.body.style.overflow).toBe('');
    });

    it('pays back the width of the scrollbar it removed', () => {
        widen(15);
        document.body.style.paddingRight = '8px';

        const view = render(<Dialog />);

        expect(document.body.style.paddingRight).toBe('23px');

        view.unmount();

        expect(document.body.style.paddingRight).toBe('8px');
    });

    it('leaves the padding alone when there is no scrollbar to replace', () => {
        const view = render(<Dialog />);

        expect(document.body.style.paddingRight).toBe('');

        view.unmount();
    });

    it('gives back the inline styles the page already had', () => {
        document.body.style.overflow = 'scroll';

        const view = render(<Dialog />);

        expect(document.body.style.overflow).toBe('hidden');

        view.unmount();

        expect(document.body.style.overflow).toBe('scroll');
    });

    it('stays locked until the last of two dialogs closes, in any order', () => {
        const first = render(<Dialog />);
        const second = render(<Dialog />);

        expect(document.body.style.overflow).toBe('hidden');

        first.unmount();

        expect(document.body.style.overflow).toBe('hidden');

        second.unmount();

        expect(document.body.style.overflow).toBe('');
    });

    it("pins the page and scrolls it back on a touch platform's browser", () => {
        const scrollTo = vi.fn();

        Object.defineProperty(window, 'scrollY', { configurable: true, value: 240 });
        Object.defineProperty(window, 'scrollTo', { configurable: true, value: scrollTo });

        const view = render(<Dialog options={{ strategy: 'fixed' }} />);

        expect(document.body.style.position).toBe('fixed');
        expect(document.body.style.top).toBe('-240px');
        expect(document.body.style.width).toBe('100%');

        view.unmount();

        expect(document.body.style.position).toBe('');
        expect(scrollTo).toHaveBeenCalledWith(0, 240);
    });

    it("picks the pinned strategy on a touch platform's browser, and only there", () => {
        const platform = (value: string, touchPoints: number) => {
            Object.defineProperty(navigator, 'platform', { configurable: true, value });
            Object.defineProperty(navigator, 'maxTouchPoints', {
                configurable: true,
                value: touchPoints,
            });
        };

        platform('iPhone', 5);

        const phone = render(<Dialog />);

        expect(document.body.style.position).toBe('fixed');
        phone.unmount();

        platform('MacIntel', 5);

        const tablet = render(<Dialog />);

        expect(document.body.style.position).toBe('fixed');
        tablet.unmount();

        platform('MacIntel', 0);

        const desktop = render(<Dialog />);

        expect(document.body.style.position).toBe('');
        expect(document.body.style.overflow).toBe('hidden');
        desktop.unmount();

        platform('Win32', 0);

        const windows = render(<Dialog />);

        expect(document.body.style.position).toBe('');
        windows.unmount();
    });

    it('marks everything outside the container inert, and only what it marked', () => {
        const sibling = document.createElement('div');
        const already = document.createElement('div');

        already.setAttribute('inert', '');
        document.body.append(sibling, already);

        const view = render(<Dialog options={{ inert: true }} />);

        expect(sibling.hasAttribute('inert')).toBe(true);
        expect(already.hasAttribute('inert')).toBe(true);

        view.unmount();

        expect(sibling.hasAttribute('inert')).toBe(false);
        expect(already.hasAttribute('inert')).toBe(true);

        sibling.remove();
        already.remove();
    });

    it('keeps the page inert until the last of two dialogs closes, in any order', () => {
        const page = document.createElement('main');

        document.body.append(page);

        const first = render(<Dialog options={{ inert: true }} />);
        const second = render(<Dialog options={{ inert: true }} />);

        expect(page.hasAttribute('inert')).toBe(true);

        first.unmount();

        expect(page.hasAttribute('inert')).toBe(true);

        second.unmount();

        expect(page.hasAttribute('inert')).toBe(false);

        page.remove();
    });

    it('locks the document the container was portaled into, not the one running the hook', () => {
        const frame = document.createElement('iframe');

        document.body.append(frame);

        const inner = frame.contentDocument!;
        const host = inner.createElement('div');
        const page = inner.createElement('div');

        inner.body.append(host, page);

        function Framed({ options }: { options?: UseLockBodyScrollOptions }) {
            const { ref } = useLockBodyScroll<HTMLDivElement>(true, options);

            return createPortal(<div ref={ref} />, host);
        }

        const view = render(<Framed options={{ inert: true }} />);

        expect(inner.body.style.overflow).toBe('hidden');
        expect(page.hasAttribute('inert')).toBe(true);
        expect(document.body.style.overflow).toBe('');

        act(() => view.rerender(<Framed />));

        expect(inner.body.style.overflow).toBe('hidden');
        expect(page.hasAttribute('inert')).toBe(false);
        expect(document.body.style.overflow).toBe('');

        view.unmount();

        expect(inner.body.style.overflow).toBe('');

        frame.remove();
    });

    it('scrolls back instantly even when the page asks for smooth scrolling', () => {
        const root = document.documentElement.style;
        const behaviors: string[] = [];

        Object.defineProperty(window, 'scrollY', { configurable: true, value: 240 });
        Object.defineProperty(window, 'scrollTo', {
            configurable: true,
            value: vi.fn(() => behaviors.push(root.scrollBehavior)),
        });

        root.scrollBehavior = 'smooth';

        const view = render(<Dialog options={{ strategy: 'fixed' }} />);

        view.unmount();

        expect(behaviors).toEqual(['auto']);
        expect(root.scrollBehavior).toBe('smooth');

        root.scrollBehavior = '';
    });

    it('locks once on mount, not once per render', () => {
        const scrollTo = vi.fn();

        Object.defineProperty(window, 'scrollY', { configurable: true, value: 120 });
        Object.defineProperty(window, 'scrollTo', { configurable: true, value: scrollTo });

        const view = render(<Dialog options={{ strategy: 'fixed' }} />);

        act(() => view.rerender(<Dialog options={{ strategy: 'fixed' }} />));

        expect(scrollTo).not.toHaveBeenCalled();
        expect(document.body.style.position).toBe('fixed');
    });

    it('reports the lock it holds', () => {
        const view = render(<Dialog />);

        expect(view.getByTestId('dialog').textContent).toBe('true');

        act(() => view.rerender(<Dialog locked={false} />));

        expect(view.getByTestId('dialog').textContent).toBe('false');
    });
});

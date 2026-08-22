import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import type { ReactNode } from 'react';

import { useFocusTrap } from './index';
import type { UseFocusTrapOptions } from './index';
import { resetFocusTrapManager } from './manager';

function Dialog(props: UseFocusTrapOptions & { label?: string }) {
    const { label = 'dialog', ...options } = props;
    const { ref, isActive } = useFocusTrap<HTMLDivElement>(options);

    return (
        <div ref={ref} role="dialog" data-testid={label} data-active={isActive}>
            <button type="button">{label}-first</button>
            <button type="button">{label}-second</button>
            <button type="button">{label}-last</button>
        </div>
    );
}

function Dialog2(props: UseFocusTrapOptions & { children: ReactNode }) {
    const { children, ...options } = props;
    const { ref, isActive } = useFocusTrap<HTMLDivElement>(options);

    return (
        <div ref={ref} role="dialog" data-testid="dialog" data-active={isActive}>
            {children}
        </div>
    );
}

function focus(el: Element | null) {
    act(() => {
        (el as HTMLElement).focus();
    });
}

function guardsOf(container: HTMLElement): HTMLElement[] {
    return Array.from(
        container.parentElement!.querySelectorAll<HTMLElement>('[data-focus-trap-guard]')
    );
}

function byText(text: string): HTMLElement {
    const el = Array.from(document.querySelectorAll('button')).find(b => b.textContent === text);

    if (!el) throw new Error(`no button "${text}"`);

    return el;
}

describe('useFocusTrap', () => {
    beforeEach(() => {
        resetFocusTrapManager();
    });

    afterEach(() => {
        resetFocusTrapManager();
        document.body.innerHTML = '';
    });

    describe('initial focus', () => {
        it('focuses the first tabbable element', () => {
            render(<Dialog />);

            expect(document.activeElement).toBe(byText('dialog-first'));
        });

        it('prefers an element marked with data-autofocus', () => {
            render(
                <Dialog2>
                    <button type="button">plain</button>
                    <button type="button" data-autofocus>
                        marked
                    </button>
                </Dialog2>
            );

            expect(document.activeElement).toBe(byText('marked'));
        });

        it('accepts a selector, an element getter, and false', () => {
            const { unmount } = render(<Dialog initialFocus="button:last-of-type" />);
            expect(document.activeElement).toBe(byText('dialog-last'));
            unmount();

            const outside = document.createElement('button');
            document.body.append(outside);
            outside.focus();

            render(<Dialog initialFocus={false} />);
            expect(document.activeElement).toBe(outside);
        });

        it('falls back to the container when nothing inside is tabbable', () => {
            const { getByTestId } = render(
                <Dialog2>
                    <p>nothing focusable</p>
                </Dialog2>
            );
            const container = getByTestId('dialog');

            expect(document.activeElement).toBe(container);
            expect(container.getAttribute('tabindex')).toBe('-1');
        });

        it('does not move focus when inactive', () => {
            const outside = document.createElement('button');
            document.body.append(outside);
            outside.focus();

            render(<Dialog active={false} />);

            expect(document.activeElement).toBe(outside);
        });
    });

    describe('wrapping', () => {
        it('sends focus to the first element when the trailing guard is reached', () => {
            const { getByTestId } = render(<Dialog />);
            const [, after] = guardsOf(getByTestId('dialog'));

            focus(after!);

            expect(document.activeElement).toBe(byText('dialog-first'));
        });

        it('sends focus to the last element when the leading guard is reached', () => {
            const { getByTestId } = render(<Dialog />);
            const [before] = guardsOf(getByTestId('dialog'));

            focus(before!);

            expect(document.activeElement).toBe(byText('dialog-last'));
        });

        it('picks up content that becomes focusable after activation', () => {
            function Growing() {
                const { ref } = useFocusTrap<HTMLDivElement>();
                const [extra, setExtra] = useState(false);

                return (
                    <div ref={ref} data-testid="dialog">
                        <button type="button" onClick={() => setExtra(true)}>
                            grow
                        </button>
                        {extra && (
                            <button type="button" id="late">
                                late
                            </button>
                        )}
                    </div>
                );
            }

            const { getByTestId } = render(<Growing />);
            act(() => byText('grow').click());

            const [before] = guardsOf(getByTestId('dialog'));
            focus(before!);

            expect(document.activeElement).toBe(byText('late'));
        });
    });

    describe('holding focus', () => {
        it('pulls focus back when it moves outside the trap', () => {
            const outside = document.createElement('button');
            document.body.append(outside);

            render(<Dialog />);
            focus(byText('dialog-second'));
            focus(outside);

            expect(document.activeElement).toBe(byText('dialog-second'));
        });

        it('recovers when focus drops to the body', async () => {
            vi.useFakeTimers();

            try {
                render(<Dialog />);
                const first = byText('dialog-first');

                act(() => {
                    first.blur();
                });
                expect(document.activeElement).toBe(document.body);

                act(() => {
                    vi.advanceTimersByTime(1);
                });

                expect(document.activeElement).toBe(first);
            } finally {
                vi.useRealTimers();
            }
        });

        it('stops holding focus once unmounted', () => {
            const outside = document.createElement('button');
            document.body.append(outside);

            const { unmount } = render(<Dialog />);
            unmount();

            outside.focus();

            expect(document.activeElement).toBe(outside);
        });
    });

    describe('return focus', () => {
        it('returns focus to the element that was focused before activation', () => {
            const trigger = document.createElement('button');
            document.body.append(trigger);
            trigger.focus();

            const { unmount } = render(<Dialog />);
            expect(document.activeElement).toBe(byText('dialog-first'));

            unmount();

            expect(document.activeElement).toBe(trigger);
        });

        it('honours returnFocus: false and an explicit target', () => {
            const trigger = document.createElement('button');
            const elsewhere = document.createElement('button');
            document.body.append(trigger, elsewhere);
            trigger.focus();

            const first = render(<Dialog returnFocus={false} />);
            first.unmount();
            expect(document.activeElement).not.toBe(trigger);

            trigger.focus();
            const second = render(<Dialog returnFocus={elsewhere} />);
            second.unmount();
            expect(document.activeElement).toBe(elsewhere);
        });

        it('does nothing when the trigger is gone', () => {
            const trigger = document.createElement('button');
            document.body.append(trigger);
            trigger.focus();

            const { unmount } = render(<Dialog />);
            trigger.remove();

            expect(() => unmount()).not.toThrow();
        });
    });

    describe('stacking', () => {
        it('gives focus control to the most recently mounted trap', () => {
            const { getByTestId, rerender } = render(<Dialog label="outer" />);

            rerender(
                <>
                    <Dialog label="outer" />
                    <Dialog label="inner" />
                </>
            );

            expect(document.activeElement).toBe(byText('inner-first'));
            expect(getByTestId('outer').dataset.active).toBe('false');
            expect(getByTestId('inner').dataset.active).toBe('true');

            focus(byText('outer-second'));

            expect(document.activeElement).toBe(byText('inner-first'));
        });

        it('suspends the guards of a trap that is not top-most', () => {
            const { getByTestId, rerender } = render(<Dialog label="outer" />);

            rerender(
                <>
                    <Dialog label="outer" />
                    <Dialog label="inner" />
                </>
            );

            expect(guardsOf(getByTestId('outer')).map(g => g.tabIndex)).toEqual([-1, -1, 0, 0]);
        });

        it('hands control back to the outer trap when the inner one closes', () => {
            const { getByTestId, rerender } = render(
                <>
                    <Dialog label="outer" />
                    <Dialog label="inner" />
                </>
            );

            focus(byText('inner-second'));
            rerender(<Dialog label="outer" />);

            expect(getByTestId('outer').dataset.active).toBe('true');
            expect(document.activeElement).toBe(byText('outer-first'));
        });

        it('respects priority over mount order', () => {
            const { getByTestId } = render(
                <>
                    <Dialog label="outer" priority={10} />
                    <Dialog label="inner" />
                </>
            );

            expect(getByTestId('outer').dataset.active).toBe('true');
            expect(document.activeElement).toBe(byText('outer-first'));
        });
    });

    describe('tabbable filtering', () => {
        it('skips disabled, hidden and tabindex=-1 elements', () => {
            const { getByTestId } = render(
                <Dialog2>
                    <button type="button" disabled>
                        disabled
                    </button>
                    <button type="button" style={{ display: 'none' }}>
                        hidden
                    </button>
                    <button type="button" tabIndex={-1}>
                        untabbable
                    </button>
                    <button type="button">real</button>
                </Dialog2>
            );

            expect(document.activeElement).toBe(byText('real'));

            const [before] = guardsOf(getByTestId('dialog'));
            focus(before!);

            expect(document.activeElement).toBe(byText('real'));
        });

        it('orders positive tabindex values first', () => {
            const { getByTestId } = render(
                <Dialog2>
                    <button type="button">natural</button>
                    <button type="button" tabIndex={2}>
                        second
                    </button>
                    <button type="button" tabIndex={1}>
                        first
                    </button>
                </Dialog2>
            );

            expect(document.activeElement).toBe(byText('first'));

            const [before] = guardsOf(getByTestId('dialog'));
            focus(before!);

            expect(document.activeElement).toBe(byText('natural'));
        });

        it('treats a radio group as a single stop', () => {
            const { getByTestId } = render(
                <Dialog2>
                    <input type="radio" name="plan" value="a" defaultChecked={false} />
                    <input type="radio" name="plan" value="b" defaultChecked />
                    <button type="button">after</button>
                </Dialog2>
            );

            const checked = getByTestId('dialog').querySelector<HTMLInputElement>('[value="b"]');

            expect(document.activeElement).toBe(checked);
        });
    });

    describe('lifecycle', () => {
        it('removes its guards and borrowed tabindex on unmount', () => {
            const { unmount } = render(
                <Dialog2>
                    <p>nothing focusable</p>
                </Dialog2>
            );

            unmount();

            expect(document.querySelectorAll('[data-focus-trap-guard]')).toHaveLength(0);
        });

        it('survives StrictMode double-invocation', () => {
            render(
                <StrictMode>
                    <Dialog />
                </StrictMode>
            );

            expect(document.activeElement).toBe(byText('dialog-first'));
            expect(document.querySelectorAll('[data-focus-trap-guard]')).toHaveLength(2);
        });

        it('activates and deactivates through the active option', () => {
            const outside = document.createElement('button');
            document.body.append(outside);
            outside.focus();

            const { rerender, getByTestId } = render(<Dialog active={false} />);
            expect(getByTestId('dialog').dataset.active).toBe('false');

            rerender(<Dialog active />);
            expect(document.activeElement).toBe(byText('dialog-first'));
            expect(getByTestId('dialog').dataset.active).toBe('true');

            rerender(<Dialog active={false} />);
            expect(document.activeElement).toBe(outside);
        });
    });
});

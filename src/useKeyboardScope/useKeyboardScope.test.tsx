import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createElement, StrictMode } from 'react';
import type { ReactNode } from 'react';

import { useKeyboardScope, KeyboardScopeProvider } from './index';
import type { KeyBindings } from './index';
import { clearComboCache, resetDefaultManager } from './manager';

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    act(() => {
        target.dispatchEvent(event);
    });
    return event;
}

function setPlatform(platform: string) {
    Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
}

describe('useKeyboardScope', () => {
    beforeEach(() => {
        resetDefaultManager();
        clearComboCache();
    });

    afterEach(() => {
        resetDefaultManager();
        clearComboCache();
        setPlatform('');
        document.body.innerHTML = '';
    });

    it('fires a bound handler on keydown', () => {
        const onK = vi.fn();
        renderHook(() => useKeyboardScope({ k: onK }));
        press('k');
        expect(onK).toHaveBeenCalledTimes(1);
    });

    it('suspends parent scopes while a child scope is active', () => {
        const parentA = vi.fn();
        const childB = vi.fn();
        renderHook(() => useKeyboardScope({ a: parentA }));
        const child = renderHook(() => useKeyboardScope({ b: childB }));

        press('a');
        expect(parentA).not.toHaveBeenCalled();

        press('b');
        expect(childB).toHaveBeenCalledTimes(1);

        child.unmount();
        press('a');
        expect(parentA).toHaveBeenCalledTimes(1);
    });

    it('passthrough lets unmatched keys fall through to the parent', () => {
        const parentA = vi.fn();
        const childB = vi.fn();
        renderHook(() => useKeyboardScope({ a: parentA }));
        renderHook(() => useKeyboardScope({ b: childB }, { passthrough: true }));

        press('a');
        expect(parentA).toHaveBeenCalledTimes(1);

        press('b');
        expect(childB).toHaveBeenCalledTimes(1);
        expect(parentA).toHaveBeenCalledTimes(1);
    });

    it('Escape is only offered to the top-most scope, never falls through', () => {
        const parentEscape = vi.fn();
        const childEscape = vi.fn();
        renderHook(() => useKeyboardScope({}, { onEscape: parentEscape }));
        const child = renderHook(() =>
            useKeyboardScope({}, { onEscape: childEscape, passthrough: true })
        );

        press('Escape');
        expect(childEscape).toHaveBeenCalledTimes(1);
        expect(parentEscape).not.toHaveBeenCalled();

        child.unmount();
        press('Escape');
        expect(parentEscape).toHaveBeenCalledTimes(1);
    });

    it('Escape does nothing when the top-most scope has no escape handling', () => {
        const parentEscape = vi.fn();
        renderHook(() => useKeyboardScope({}, { onEscape: parentEscape }));
        renderHook(() => useKeyboardScope({ x: vi.fn(() => {}) }));

        press('Escape');
        expect(parentEscape).not.toHaveBeenCalled();
    });

    it("resolves 'mod' to meta on macOS and ctrl elsewhere", () => {
        const handler = vi.fn();
        setPlatform('MacIntel');
        const mac = renderHook(() => useKeyboardScope({ 'mod+k': handler }));

        press('k', { metaKey: true });
        expect(handler).toHaveBeenCalledTimes(1);
        press('k', { ctrlKey: true });
        expect(handler).toHaveBeenCalledTimes(1);

        mac.unmount();
        clearComboCache();
        setPlatform('Win32');
        renderHook(() => useKeyboardScope({ 'mod+k': handler }));

        press('k', { ctrlKey: true });
        expect(handler).toHaveBeenCalledTimes(2);
        press('k', { metaKey: true });
        expect(handler).toHaveBeenCalledTimes(2);
    });

    it('ignores bindings inherited from the object prototype', () => {
        const inherited = vi.fn();
        const own = vi.fn();
        const bindings: KeyBindings = Object.assign(Object.create({ j: inherited }) as object, {
            k: own,
        });

        renderHook(() => useKeyboardScope(bindings));

        press('j');
        expect(inherited).not.toHaveBeenCalled();

        press('k');
        expect(own).toHaveBeenCalledTimes(1);
    });

    it('keeps matching once the combo cache passes its cap', () => {
        const below = vi.fn();
        renderHook(() => useKeyboardScope({ 'shift+q': below }));

        const many: KeyBindings = {};

        for (let i = 0; i < 600; i += 1) many[`ctrl+f${i}`] = () => undefined;

        const last = vi.fn();
        many['ctrl+z'] = last;
        renderHook(() => useKeyboardScope(many, { passthrough: true }));

        press('z', { ctrlKey: true });
        expect(last).toHaveBeenCalledTimes(1);

        press('Q', { shiftKey: true });
        expect(below).toHaveBeenCalledTimes(1);
    });

    it('skips form elements unless enableOnFormElements', () => {
        const plain = vi.fn();
        const onForm = vi.fn();
        renderHook(() =>
            useKeyboardScope({
                a: plain,
                b: { handler: onForm, enableOnFormElements: true },
            })
        );
        const input = document.createElement('input');
        document.body.appendChild(input);

        press('a', {}, input);
        expect(plain).not.toHaveBeenCalled();

        press('b', {}, input);
        expect(onForm).toHaveBeenCalledTimes(1);

        press('a');
        expect(plain).toHaveBeenCalledTimes(1);
    });

    it("matches shifted symbols by either spelling ('shift+/' and '?')", () => {
        const bySpec = vi.fn();
        const byChar = vi.fn();
        renderHook(() => useKeyboardScope({ 'shift+/': bySpec }));
        renderHook(() => useKeyboardScope({ '?': byChar }, { passthrough: true }));

        press('?', { shiftKey: true });
        expect(byChar).toHaveBeenCalledTimes(1);
    });

    it("'shift+/' spec matches a real Shift+/ keypress (event.key is already '?')", () => {
        const handler = vi.fn(() => {});
        renderHook(() => useKeyboardScope({ 'shift+/': handler }));
        press('?', { shiftKey: true });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("'shift+1' spec matches a real Shift+1 keypress (event.key is already '!')", () => {
        const handler = vi.fn(() => {});
        renderHook(() => useKeyboardScope({ 'shift+1': handler }));
        press('!', { shiftKey: true });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('ignores IME composition events', () => {
        const handler = vi.fn();
        renderHook(() => useKeyboardScope({ a: handler }));
        press('a', { isComposing: true });
        expect(handler).not.toHaveBeenCalled();
    });

    it('priority overrides activation order', () => {
        const low = vi.fn();
        const high = vi.fn();
        renderHook(() => useKeyboardScope({ a: high }, { priority: 10 }));
        renderHook(() => useKeyboardScope({ a: low }));

        press('a');
        expect(high).toHaveBeenCalledTimes(1);
        expect(low).not.toHaveBeenCalled();
    });

    it('reports isTopMost reactively', () => {
        const parent = renderHook(() => useKeyboardScope({ a: vi.fn(() => {}) }));
        expect(parent.result.current.isTopMost).toBe(true);

        const child = renderHook(() => useKeyboardScope({ b: vi.fn(() => {}) }));
        expect(child.result.current.isTopMost).toBe(true);
        expect(parent.result.current.isTopMost).toBe(false);

        child.unmount();
        expect(parent.result.current.isTopMost).toBe(true);
    });

    it('isTopMost updates when an already-mounted scope re-registers (e.g. `active` toggled true)', () => {
        const { result, rerender } = renderHook(
            ({ active }: { active: boolean }) =>
                useKeyboardScope({ a: vi.fn(() => {}) }, { active }),
            { initialProps: { active: false } }
        );
        expect(result.current.isTopMost).toBe(false);

        rerender({ active: true });
        expect(result.current.isTopMost).toBe(true);
    });

    it('active: false removes the scope from the stack', () => {
        const handler = vi.fn();
        const { rerender } = renderHook(
            ({ active }) => useKeyboardScope({ a: handler }, { active }),
            {
                initialProps: { active: true },
            }
        );

        press('a');
        expect(handler).toHaveBeenCalledTimes(1);

        rerender({ active: false });
        press('a');
        expect(handler).toHaveBeenCalledTimes(1);

        rerender({ active: true });
        press('a');
        expect(handler).toHaveBeenCalledTimes(2);
    });

    it('reads the latest handler (no stale closures)', () => {
        const first = vi.fn();
        const second = vi.fn();
        const { rerender } = renderHook(({ fn }) => useKeyboardScope({ a: fn }), {
            initialProps: { fn: first },
        });
        rerender({ fn: second });

        press('a');
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('is idempotent under StrictMode double-effects', () => {
        const handler = vi.fn();
        const wrapper = ({ children }: { children: ReactNode }) =>
            createElement(StrictMode, null, children);
        renderHook(() => useKeyboardScope({ a: handler }), { wrapper });

        press('a');
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("resolves 'mod' via the userAgent fallback when platform is unavailable", () => {
        const handler = vi.fn();
        Object.defineProperty(navigator, 'platform', { value: undefined, configurable: true });
        Object.defineProperty(navigator, 'userAgent', {
            value: 'Mozilla/5.0 (iPhone; CPU iPhone OS)',
            configurable: true,
        });
        renderHook(() => useKeyboardScope({ 'mod+k': handler }));

        press('k', { metaKey: true });
        expect(handler).toHaveBeenCalledTimes(1);

        Object.defineProperty(navigator, 'platform', { value: '', configurable: true });
    });

    it("resolves 'mod' via the platform fallback when userAgent is unavailable", () => {
        const handler = vi.fn();
        Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
        Object.defineProperty(navigator, 'userAgent', { value: undefined, configurable: true });
        renderHook(() => useKeyboardScope({ 'mod+k': handler }));

        press('k', { ctrlKey: true });
        expect(handler).toHaveBeenCalledTimes(1);

        Object.defineProperty(navigator, 'userAgent', { value: '', configurable: true });
    });

    it("falls back to ctrl for 'mod' when navigator itself is unavailable", () => {
        const handler = vi.fn();
        vi.stubGlobal('navigator', undefined);

        try {
            renderHook(() => useKeyboardScope({ 'mod+k': handler }));
            press('k', { ctrlKey: true });
            expect(handler).toHaveBeenCalledTimes(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it.each(['meta', 'cmd', 'command'])("recognizes the '%s' modifier alias", spec => {
        const handler = vi.fn();
        renderHook(() => useKeyboardScope({ [`${spec}+k`]: handler }));
        press('k', { metaKey: true });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it.each(['alt', 'option'])("recognizes the '%s' modifier alias", spec => {
        const handler = vi.fn();
        renderHook(() => useKeyboardScope({ [`${spec}+k`]: handler }));
        press('k', { altKey: true });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("matches a physical key via 'code:' regardless of the produced character", () => {
        const handler = vi.fn();
        renderHook(() => useKeyboardScope({ 'code:KeyQ': handler }));

        press('a', { code: 'KeyR' });
        expect(handler).not.toHaveBeenCalled();

        press('a', { code: 'KeyQ' });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("'esc' spec text matches the Escape key", () => {
        const handler = vi.fn();
        renderHook(() => useKeyboardScope({ esc: handler }));
        press('Escape');
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('a binding whose spec has no actual key (only modifiers) never matches', () => {
        const handler = vi.fn();
        renderHook(() => useKeyboardScope({ 'ctrl+shift': handler }));
        press('a', { ctrlKey: true, shiftKey: true });
        expect(handler).not.toHaveBeenCalled();
    });

    it('requires an exact meta/alt modifier match, not just the base key', () => {
        const plain = vi.fn();
        renderHook(() => useKeyboardScope({ k: plain }));

        press('k', { metaKey: true });
        expect(plain).not.toHaveBeenCalled();

        press('k', { altKey: true });
        expect(plain).not.toHaveBeenCalled();

        press('k');
        expect(plain).toHaveBeenCalledTimes(1);
    });

    it('a plain (non-symbol) binding requires shiftKey to match exactly', () => {
        const plain = vi.fn();
        renderHook(() => useKeyboardScope({ k: plain }));

        press('k', { shiftKey: true });
        expect(plain).not.toHaveBeenCalled();
    });

    it('ignores repeated keydown events when ignoreRepeat is set', () => {
        const handler = vi.fn();
        renderHook(() => useKeyboardScope({ k: { handler, ignoreRepeat: true } }));

        press('k', { repeat: true });
        expect(handler).not.toHaveBeenCalled();

        press('k');
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('skips a binding whose value is explicitly undefined', () => {
        const fallback = vi.fn();
        const bindings: Record<string, KeyBindings[string] | undefined> = {
            a: undefined,
        };
        renderHook(() =>
            useKeyboardScope({ ...(bindings as KeyBindings), b: fallback }, { passthrough: true })
        );

        press('a');
        press('b');
        expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('a matched Escape binding runs instead of onEscape, honoring preventDefault', () => {
        const escapeHandler = vi.fn();
        const onEscape = vi.fn();
        renderHook(() => useKeyboardScope({ escape: escapeHandler }, { onEscape }));

        const event = press('Escape');
        expect(escapeHandler).toHaveBeenCalledTimes(1);
        expect(onEscape).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
    });

    it('a matched Escape binding can opt out of preventDefault', () => {
        const escapeHandler = vi.fn();
        renderHook(() =>
            useKeyboardScope({ escape: { handler: escapeHandler, preventDefault: false } })
        );

        const event = press('Escape');
        expect(escapeHandler).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(false);
    });

    it('a matched non-Escape binding can opt out of preventDefault', () => {
        const handler = vi.fn();
        renderHook(() => useKeyboardScope({ a: { handler, preventDefault: false } }));

        const event = press('a');
        expect(handler).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(false);
    });

    it('KeyboardScopeProvider isolates scopes to a custom target', () => {
        const handler = vi.fn();
        const target = document.createElement('div');
        document.body.appendChild(target);
        const wrapper = ({ children }: { children: ReactNode }) =>
            createElement(KeyboardScopeProvider, { target }, children);
        renderHook(() => useKeyboardScope({ a: handler }), { wrapper });

        press('a');
        expect(handler).not.toHaveBeenCalled();

        press('a', {}, target);
        expect(handler).toHaveBeenCalledTimes(1);
    });
});

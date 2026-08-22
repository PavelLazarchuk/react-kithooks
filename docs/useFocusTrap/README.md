# useFocusTrap

Confines Tab to one container and hands focus back when it closes. Traps stack: **the most recently opened one owns focus**, so a dialog opened from a dialog behaves.

```ts
import { useFocusTrap } from 'react-kithooks/useFocusTrap';
```

## The problem

A modal that doesn't trap focus lets Tab walk straight out into the page behind it — the screen reader keeps reading a dialog the user has already left, and the keyboard user has no way back in. The usual fix intercepts `keydown` for Tab, collects focusable elements once, and wraps by hand. That version breaks in every direction:

- the list is stale the moment the dialog's content loads, a field is enabled, or a step is revealed;
- `preventDefault` on Tab fights the browser — focus that went out to the URL bar comes back to the wrong place;
- a click on the page behind, or a `.focus()` from some other component, moves focus out without a `keydown` ever firing;
- when the dialog closes, focus falls to `<body>` and the next Tab restarts at the top of the page instead of at the button that opened it;
- two open layers both trap, and they fight.

This hook wraps focus with **sentinel nodes** — real focusable elements it places just outside the container — so Tab order stays the browser's own and is recomputed at the moment focus reaches the edge. A `focusin`/`focusout` listener is the net for everything that isn't a Tab, and a stack keeps layered traps from fighting.

## Usage

```tsx
function Modal({ onClose, children }) {
    const { ref } = useFocusTrap<HTMLDivElement>();

    // Escape belongs to the keyboard stack, not the focus stack.
    useKeyboardScope({}, { onEscape: onClose });

    return (
        <div className="backdrop">
            <div ref={ref} role="dialog" aria-modal="true">
                {children}
            </div>
        </div>
    );
}
```

Focus the field the user actually came for, not the close button:

```tsx
<input data-autofocus />;
// or
useFocusTrap({ initialFocus: '#email' });
```

Trap only while open, without unmounting the component:

```tsx
const { ref } = useFocusTrap({ active: isOpen });
```

## API

```ts
function useFocusTrap<T extends HTMLElement = HTMLDivElement>(
    options?: UseFocusTrapOptions
): UseFocusTrapReturn<T>;
```

### Options

| Option          | Type                     | Default | Description                                                                                              |
| --------------- | ------------------------ | ------- | -------------------------------------------------------------------------------------------------------- |
| `active`        | `boolean`                | `true`  | Whether the trap is armed. Flipping it to `false` releases focus and returns it, without unmounting.     |
| `initialFocus`  | `FocusTarget \| false`   | —       | Where focus goes on activation. `false` leaves focus alone. See resolution order below.                  |
| `returnFocus`   | `FocusTarget \| boolean` | `true`  | Where focus goes on deactivation. `true` restores whatever was focused before; `false` restores nothing. |
| `priority`      | `number`                 | `0`     | Higher priority wins over later activation — use it to force a trap above the stack order.               |
| `preventScroll` | `boolean`                | `false` | Pass `preventScroll` to every `focus()` call, so focusing an offscreen element doesn't scroll the page.  |

`FocusTarget` is an `HTMLElement`, a CSS selector string, or a `() => HTMLElement | null` getter — resolved lazily, at the moment focus moves.

### Returns

| Field      | Type             | Description                                                                     |
| ---------- | ---------------- | ------------------------------------------------------------------------------- |
| `ref`      | `RefCallback<T>` | Attach to the element to trap focus inside.                                     |
| `isActive` | `boolean`        | Whether this trap is currently the top-most one — i.e. the one that owns focus. |

### Initial focus resolution

In order, first match wins:

1. `initialFocus`, if given and the element is in the document;
2. an element inside the container matching `[data-autofocus]` or `[autofocus]`;
3. the first tabbable element;
4. the container itself — a `tabindex="-1"` is borrowed for the trap's lifetime and removed on cleanup.

### What counts as tabbable

Standard focusable elements minus everything the browser skips: `disabled` (including inside a disabled `<fieldset>`, except its first `<legend>`), `tabindex="-1"`, `hidden`, `display: none`, `visibility: hidden`, `[inert]`, collapsed `<details>` content, and `input[type="hidden"]`. Radio groups count as one stop — the checked radio, or the first when none is checked. Positive `tabindex` values are visited first, ascending, then everything else in document order.

## Notes

- Stack order is `priority` descending, then activation order descending. Only the top-most trap enforces focus; the ones below suspend their sentinels so they can't swallow a Tab from the layer above.
- The sentinels are two `aria-hidden` spans inserted as siblings of the container. They are removed on cleanup.
- Focus that lands outside the trap by any means — a click, a stray `.focus()`, a removed node dropping focus to `<body>` — is pulled back to the element that was last focused inside, or to the first tabbable one.
- Escape is deliberately not handled. Compose with [useKeyboardScope](../useKeyboardScope/README.md), which already guarantees Escape reaches only the top-most layer.
- Trapping focus does not make a dialog modal for a mouse or a screen reader. Still set `role="dialog"` and `aria-modal="true"`, and still render a backdrop.
- If `returnFocus` resolves to an element that has since left the document, nothing is focused — the browser's own fallback applies.

## SSR

`isActive` server-renders as `false` and `ref` is a no-op until it attaches. Nothing touches `document` until effects run.

---

[← All hooks](../../README.md)

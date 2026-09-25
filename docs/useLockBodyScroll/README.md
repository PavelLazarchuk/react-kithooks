# useLockBodyScroll

Freezes the page behind a dialog. **Locks stack**, the scrollbar's width is paid back, and iOS Safari is actually held still.

```ts
import { useLockBodyScroll } from 'react-kithooks/useLockBodyScroll';
```

## The problem

`document.body.style.overflow = 'hidden'` is the one-liner everyone writes, and it is wrong in three ways that all show up in production:

- **iOS Safari scrolls anyway.** `overflow: hidden` on `<body>` does not stop touch scrolling there; the page drifts behind the dialog and rubber-bands at the edges.
- **The layout jumps.** Hiding the overflow removes the scrollbar, the viewport gets ~15 px wider, and the whole page — including the fixed header — shifts under the dialog.
- **Two dialogs fight.** Open a confirm from inside a modal, close it, and the cleanup that runs first hands the page back while the modal is still open. Close them the other way round and the page stays frozen forever.

And the naive cleanup sets `overflow` back to `''`, which throws away whatever inline value the page had before.

This hook keeps one lock stack per document: the first lock freezes the page, the last release restores it — from the styles it snapshotted, not from a hardcoded blank.

## Usage

```tsx
function Modal({ isOpen, onClose, children }) {
    const { ref } = useLockBodyScroll<HTMLDivElement>(isOpen);

    if (!isOpen) return null;

    return (
        <div className="backdrop" onClick={onClose}>
            <div ref={ref} role="dialog" aria-modal="true">
                {children}
            </div>
        </div>
    );
}
```

The `ref` is only needed for `inert`. Locking the page alone is one argument:

```tsx
useLockBodyScroll(isOpen);
```

Take the page away from the keyboard and the screen reader too, not just the mouse:

```tsx
const { ref } = useLockBodyScroll(isOpen, { inert: true });
```

## API

```ts
function useLockBodyScroll<T extends HTMLElement = HTMLDivElement>(
    locked?: boolean,
    options?: UseLockBodyScrollOptions
): UseLockBodyScrollReturn<T>;
```

### Options

| Option     | Type                              | Default  | Description                                                                                             |
| ---------- | --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `strategy` | `'auto' \| 'overflow' \| 'fixed'` | `'auto'` | How to hold the page. `'auto'` picks `'fixed'` on iOS and iPadOS, `'overflow'` everywhere else.         |
| `gutter`   | `boolean`                         | `true`   | Add the width of the hidden scrollbar back as `padding-right`, so nothing shifts.                       |
| `inert`    | `boolean`                         | `false`  | Mark everything outside the container `inert`. Needs the `ref`; without it the lock waits for the node. |

### Returns

| Field      | Type             | Description                                                  |
| ---------- | ---------------- | ------------------------------------------------------------ |
| `ref`      | `RefCallback<T>` | Attach to the dialog container. Only `inert: true` reads it. |
| `isLocked` | `boolean`        | Whether this hook currently holds a lock.                    |

## Notes

- The `'fixed'` strategy pins `<body>` at `top: -scrollY` and scrolls back to exactly where the reader was on release, so the page does not jump to the top when the dialog closes. That scroll is instant even under `scroll-behavior: smooth`, which would otherwise animate the page down from the top.
- Locks are counted per `document` — the one the `ref`'s node lives in, or the page's own when no `ref` is attached — so a portal into an iframe locks that iframe, not the page around it.
- `inert` is applied per hook, not per stack: a second dialog marks the first one inert. Each marking is counted, so an element two dialogs both marked stays `inert` until both have closed, in any order — and an element that was already `inert` before is left alone.
- Compose with [useFocusTrap](../useFocusTrap/README.md) for Tab and [useKeyboardScope](../useKeyboardScope/README.md) for Escape. This hook only holds the page still.
- `inert` needs Chrome 102+, Safari 15.5+ or Firefox 112+. In older browsers the attribute is ignored and the scroll lock still works.

## SSR

`isLocked` server-renders as `false`, `ref` is a no-op, and nothing reads `document` until effects run.

---

[← All hooks](../../README.md)

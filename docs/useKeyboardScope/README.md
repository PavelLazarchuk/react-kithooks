# useKeyboardScope

Stack-based keyboard shortcut scoping for layered UI. The most recently activated scope suspends everything below it, and **Escape only ever reaches the top-most layer.**

```ts
import { useKeyboardScope, KeyboardScopeProvider } from 'react-kithooks/useKeyboardScope';
```

## The problem

Flat `keydown` listeners have no idea what's on top. Open a modal over a page that listens for Escape and both handlers fire — one Escape closes the modal _and_ the drawer behind it. Add a command palette and `mod+k` now runs twice. The usual workarounds (`stopPropagation` from the deepest handler, a global "is a modal open?" flag) break the moment there are two independent layers.

This hook keeps a stack. Registering a scope pushes it; unmounting pops it. Only the top-most scope handles keys, and Escape is offered to it alone — the layer underneath never sees it.

## Usage

```tsx
// page level
useKeyboardScope({ 'mod+k': openPalette, '/': focusSearch });

// inside a modal — while it's mounted, page shortcuts are suspended
useKeyboardScope({ 'mod+enter': submit }, { onEscape: closeModal });
```

Per-binding options:

```tsx
useKeyboardScope({
    'mod+s': { handler: save, preventDefault: true },
    'mod+enter': { handler: submit, enableOnFormElements: true },
    ArrowDown: { handler: next, ignoreRepeat: false },
});
```

Let unmatched keys fall through to the layer below:

```tsx
useKeyboardScope({ 'mod+f': findInPanel }, { passthrough: true });
```

## API

```ts
function useKeyboardScope(
    bindings: KeyBindings,
    options?: UseKeyboardScopeOptions
): UseKeyboardScopeReturn;
```

### Key syntax

| Form               | Example              | Notes                                                                      |
| ------------------ | -------------------- | -------------------------------------------------------------------------- |
| Plain key          | `'Escape'`, `'a'`    | Matched against `event.key`, case-insensitive. `'esc'` aliases `'escape'`. |
| Modifiers          | `'mod+k'`            | `mod` = ⌘ on macOS, Ctrl elsewhere.                                        |
| Explicit modifiers | `'ctrl+shift+p'`     | `ctrl`/`control`, `meta`/`cmd`/`command`, `alt`/`option`, `shift`.         |
| Physical key       | `'mod+code:KeyQ'`    | Matched against `event.code` — works on non-Latin layouts.                 |
| Alternatives       | `'mod+k, ctrl+k'`    | Comma-separated; any of them matches.                                      |
| Shifted symbols    | `'?'` or `'shift+/'` | Both match, via a US-QWERTY shift map.                                     |

### Binding values

A binding is either a handler function, or an object:

| Field                  | Type                             | Default | Description                                                           |
| ---------------------- | -------------------------------- | ------- | --------------------------------------------------------------------- |
| `handler`              | `(event: KeyboardEvent) => void` | —       | The handler.                                                          |
| `preventDefault`       | `boolean`                        | `true`  | Call `event.preventDefault()` on a match.                             |
| `enableOnFormElements` | `boolean`                        | `false` | Also fire while an input/textarea/select/`contenteditable` has focus. |
| `ignoreRepeat`         | `boolean`                        | `false` | Skip auto-repeat events (`event.repeat`).                             |

### Options

| Option        | Type         | Default | Description                                                                                    |
| ------------- | ------------ | ------- | ---------------------------------------------------------------------------------------------- |
| `active`      | `boolean`    | `true`  | Register this scope. `false` unregisters it without unmounting the component.                  |
| `passthrough` | `boolean`    | `false` | Let keys this scope doesn't match fall through to the scope below. Escape never falls through. |
| `priority`    | `number`     | `0`     | Higher priority wins over later registration — use it to force a scope above the stack order.  |
| `onEscape`    | `() => void` | —       | Called on Escape when the scope is top-most and has no explicit `Escape` binding.              |

### Returns

| Field       | Type      | Description                                     |
| ----------- | --------- | ----------------------------------------------- |
| `isTopMost` | `boolean` | Whether this scope currently owns the keyboard. |

### KeyboardScopeProvider

Optional — the hook works without it via a module-level manager attached to `document`. Use the provider to isolate a subtree or bind a different event target:

| Prop       | Type          | Description                                         |
| ---------- | ------------- | --------------------------------------------------- |
| `target`   | `EventTarget` | Where to attach the listener (default: `document`). |
| `children` | `ReactNode`   |                                                     |

```tsx
<KeyboardScopeProvider target={shadowRoot}>
    <Panel />
</KeyboardScopeProvider>
```

Reach for it with shadow DOM, custom event targets, or multiple React roots on one page.

## Notes

- Stack order is `priority` descending, then registration order descending — the most recently mounted scope at a given priority is on top.
- IME composition is ignored (`isComposing`, `keyCode === 229`), so typing Japanese/Chinese into an input never triggers shortcuts.
- Form elements are skipped by default; opt in per binding with `enableOnFormElements`.
- The listener is attached only while at least one scope is registered, and detached when the last one unmounts.

## SSR

`isTopMost` server-renders as `false`; nothing is registered until effects run.

---

[← All hooks](../../README.md)

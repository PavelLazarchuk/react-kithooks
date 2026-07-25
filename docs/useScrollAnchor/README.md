# useScrollAnchor

Keeps the viewport stable when a scrollable list grows — no jump when older items are prepended, sticky bottom on append only while the user is already there.

```ts
import { useScrollAnchor } from 'react-kithooks/useScrollAnchor';
```

## The problem

Prepending items to a scroll container (loading older chat messages) pushes everything down by the new content's height, and the browser keeps `scrollTop` — so the user's reading position jumps. The usual fix diffs `scrollHeight` before/after the update, which breaks as soon as content above the anchor changes size later (images decoding, fonts swapping, embeds resizing).

This hook anchors to an **element** instead: it remembers a real child node and its offset from the viewport top, then restores that exact relationship after the DOM commit — and keeps re-restoring it for a short settle window while async content above finishes laying out. Safari, which has no native `overflow-anchor`, is covered the same way as everything else.

## Usage

```tsx
const { ref, isAtBottom, prepend, scrollToBottom } = useScrollAnchor();

<div ref={ref} className="messages">
    {messages.map(m => (
        <Message key={m.id} {...m} />
    ))}
</div>;

// loading older messages — no viewport jump:
prepend(() => setMessages([...older, ...messages]));

// new message arrived: it auto-sticks to the bottom only if the user was
// already near the bottom — reading history is never interrupted
```

Jump-to-latest affordance:

```tsx
{
    !isAtBottom && (
        <button onClick={() => scrollToBottom({ behavior: 'smooth' })}>New messages ↓</button>
    );
}
```

## API

```ts
function useScrollAnchor<T extends HTMLElement = HTMLDivElement>(
    options?: UseScrollAnchorOptions
): UseScrollAnchorReturn<T>;
```

### Options

| Option                  | Type             | Default  | Description                                                                                                                                          |
| ----------------------- | ---------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bottomThreshold`       | `number`         | `40`     | How many pixels from the bottom still counts as "at the bottom" (a 1px epsilon is added on top, since `scrollTop` is fractional on zoomed displays). |
| `behavior`              | `ScrollBehavior` | `'auto'` | Default behavior for auto-stick and `scrollToBottom()`.                                                                                              |
| `observeResize`         | `boolean`        | `true`   | Watch children with `ResizeObserver` so late layout shifts (images, fonts) re-anchor instead of drifting.                                            |
| `initialScrollToBottom` | `boolean`        | `true`   | Jump to the bottom when the element is first attached.                                                                                               |
| `disabled`              | `boolean`        | `false`  | Turn all scroll management off — `prepend(fn)` still runs `fn`, it just doesn't anchor.                                                              |

### Returns

| Field            | Type                                             | Description                                                                                      |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `ref`            | `RefCallback<T>`                                 | Attach to the scrollable element.                                                                |
| `isAtBottom`     | `boolean`                                        | Whether the user is within `bottomThreshold` of the bottom. Drives "scroll to latest" UI.        |
| `prepend`        | `(mutate: () => void) => void`                   | Wrap the state update that prepends items — the anchor is captured before it and restored after. |
| `scrollToBottom` | `(opts?: { behavior?: ScrollBehavior }) => void` | Scroll to the bottom and mark the view as "at bottom".                                           |

## Notes

- `prepend` takes the **state update**, not the data. It captures the anchor synchronously, then calls your `mutate()`; the restore happens when the resulting DOM mutation lands. If no mutation arrives within 1s the captured anchor is dropped.
- The anchor is the container's first element child at capture time — so prepend by rendering new items **before** the existing ones, not by replacing the whole list with fresh nodes.
- The element gets `overflow-anchor: none` so the browser's own scroll anchoring can't fight this hook.
- **`behavior: 'smooth'` respects `prefers-reduced-motion`.** Auto-stick and jump-to-latest are motion the reader never asked for, which is exactly what the setting is about; the scroll still lands in the same place, it just lands instantly.
- Any real user intent — wheel, touch, keydown, or a manual scroll — cancels the settle window immediately, so re-anchoring never yanks the view back from under an actively scrolling user.
- Programmatic scrolls are filtered out of the `scroll` handler (a counter for instant scrolls, a time window for smooth ones), so they don't get mistaken for user scrolling.

## Alternatives

If you only need stick-to-bottom for appended content, [use-stick-to-bottom](https://github.com/stackblitz-labs/use-stick-to-bottom) is excellent. Use this hook when you also load history upward.

## SSR

Import-safe; nothing touches the DOM until the callback ref runs. `isAtBottom` renders as `true` on the server.

---

[← All hooks](../../README.md)

# useIsFirstRender

`true` during the initial render pass, `false` on every render after mount — consistently, including under StrictMode.

```ts
import { useIsFirstRender } from 'react-kithooks/useIsFirstRender';
```

## The problem

The common implementation flips a ref **during** render:

```tsx
const isFirst = useRef(true);
if (isFirst.current) {
    isFirst.current = false;
    return true;
}
return false;
```

Under StrictMode's development double-render, the second pass sees the already-flipped ref and reports `false` — so the component behaves differently in dev and in prod. An intro animation gets skipped only in dev; an "on change" effect fires on mount only in dev. Both are the kind of bug you chase in the wrong file.

This version flips in an effect, so every pre-mount render pass is consistently `true`.

## Usage

```tsx
const isFirstRender = useIsFirstRender();

// don't animate the initial mount, animate every change after it
<Item className={isFirstRender ? '' : 'animate-in'} />;
```

Skipping the mount run of an effect:

```tsx
const isFirstRender = useIsFirstRender();

useEffect(() => {
    if (isFirstRender) return;
    trackFilterChanged(filters);
}, [filters, isFirstRender]);
```

## API

```ts
function useIsFirstRender(): boolean;
```

### Returns

`boolean` — `true` while the component is in its initial render pass, `false` afterwards.

## Notes

- Because the flip happens in an effect, the value is `true` for **every** render pass before mount completes — which is exactly what makes dev and prod agree.
- Reading it doesn't trigger a re-render of its own; the value simply differs on the next render the component performs.
- For "did this specific value change since last render?", use [usePreviousValue](../usePreviousValue/README.md) instead — first-render detection is a coarser question.

## Related

- [usePreviousValue](../usePreviousValue/README.md) — the previous distinct value.

## SSR

Server-renders `true`.

---

[← All hooks](../../README.md)

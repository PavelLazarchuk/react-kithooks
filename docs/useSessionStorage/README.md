# useSessionStorage

`useState`, but backed by `sessionStorage` — state that survives a reload but dies with the tab.

```ts
import { useSessionStorage } from 'react-kithooks/useSessionStorage';
```

## Why

Same API and the same failure-mode fixes as [useLocalStorage](../useLocalStorage/README.md), with a different lifetime: `sessionStorage` is scoped to the tab. It's cleared when the tab closes and is never shared with a freshly-opened one, which is exactly what you want for state that shouldn't leak between sessions — a wizard step, a one-time redirect flag, a per-checkout-session id.

Both hooks share one internal implementation, so they can't drift apart.

## Usage

```tsx
const [draftId, setDraftId, clearDraftId] = useSessionStorage<string | null>('draft-id', null);
const [step, setStep] = useSessionStorage('checkout-step', 0);

setStep(s => s + 1); // survives a reload, gone when the tab closes
```

## API

```ts
function useSessionStorage<T>(
    key: string,
    initialValue: T | (() => T),
    options?: UseSessionStorageOptions<T>
): UseSessionStorageReturn<T>;
```

### Parameters

| Parameter      | Type             | Description                                                                               |
| -------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| `key`          | `string`         | Storage key. Changing it re-reads under the new key.                                      |
| `initialValue` | `T \| (() => T)` | Fallback while the key is absent or unparsable. Lazy form is called at most once per key. |

### Options

| Option        | Type                   | Default          | Description                      |
| ------------- | ---------------------- | ---------------- | -------------------------------- |
| `serialize`   | `(value: T) => string` | `JSON.stringify` | How the value is written.        |
| `deserialize` | `(raw: string) => T`   | `JSON.parse`     | How the raw string is read back. |

### Returns

A tuple:

| Position | Name          | Type                                    | Description                                                  |
| -------- | ------------- | --------------------------------------- | ------------------------------------------------------------ |
| `[0]`    | `value`       | `T`                                     | Current value, or `initialValue` if nothing valid is stored. |
| `[1]`    | `setValue`    | `(next: T \| ((prev: T) => T)) => void` | Writes and notifies every subscriber in this tab.            |
| `[2]`    | `removeValue` | `() => void`                            | Removes the key; the value reverts to `initialValue`.        |

## Notes

- Every hook instance in the tab stays in sync, same as `useLocalStorage`.
- `initialValue` is never written on mount; parse errors and quota failures fall back gracefully instead of throwing. When storage is unavailable or full, the value is kept in memory for the rest of the session rather than silently refusing to change — see [useLocalStorage](../useLocalStorage/README.md) for the details, the behaviour is identical.
- The native `storage` event still fires for same-origin frames and popups that share this tab's session storage area, so the hook stays reactive there — it just never crosses into an unrelated tab.
- Prefer this over `useLocalStorage` whenever a value outliving the tab would be a bug rather than a feature.

## Related

- [useLocalStorage](../useLocalStorage/README.md) — same API, shared across tabs and persistent.

## SSR

Server-renders `initialValue`; the stored value applies right after hydration, with no mismatch.

---

[← All hooks](../../README.md)

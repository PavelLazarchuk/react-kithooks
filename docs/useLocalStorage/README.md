# useLocalStorage

`useState`, but backed by `localStorage` and kept in sync across every tab, window, and hook instance on the origin.

```ts
import { useLocalStorage } from 'react-kithooks/useLocalStorage';
```

## The problem

The naive version reads storage in `useState`'s initializer and writes in an effect. That gives you: a hydration mismatch on SSR, one component's `setValue` invisible to another component reading the same key, a throw on the first hand-edited or corrupted value, a crash when the quota is full, and `initialValue` written to disk on mount — which means "no value stored yet" and "stored value that happens to equal the default" become indistinguishable.

Cross-tab is worse: the native `storage` event fires in _other_ tabs only, never in the one that wrote — so if you rely on it alone, the writing tab's own siblings never update.

This hook subscribes every instance to one store per key, so both directions work.

## Usage

```tsx
const [count, setCount, removeCount] = useLocalStorage('count', 0);

setCount(c => c + 1); // persisted, and every other tab/component sees it update
removeCount(); // clears the key, reverts to the initial value
```

Values `JSON` can't round-trip:

```tsx
const [seen, setSeen] = useLocalStorage('seen-ids', new Set<string>(), {
    serialize: s => JSON.stringify([...s]),
    deserialize: raw => new Set(JSON.parse(raw) as string[]),
});
```

Expensive default:

```tsx
const [prefs, setPrefs] = useLocalStorage('prefs', () => computeDefaults());
```

## API

```ts
function useLocalStorage<T>(
    key: string,
    initialValue: T | (() => T),
    options?: UseLocalStorageOptions<T>
): UseLocalStorageReturn<T>;
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

| Position | Name          | Type                                    | Description                                                   |
| -------- | ------------- | --------------------------------------- | ------------------------------------------------------------- |
| `[0]`    | `value`       | `T`                                     | Current value, or `initialValue` if nothing valid is stored.  |
| `[1]`    | `setValue`    | `(next: T \| ((prev: T) => T)) => void` | Writes and notifies every subscriber. Updater form supported. |
| `[2]`    | `removeValue` | `() => void`                            | Removes the key; the value reverts to `initialValue`.         |

## Notes

- **`initialValue` is never written to storage on mount.** It's purely the fallback while the key is absent — nothing is written until `setValue` runs, so "unset" stays distinguishable from "set to the default".
- Corrupted or hand-edited values fall back to `initialValue` instead of throwing, and a write that exceeds the quota does not crash the render.
- Parsed values are cached against the raw string, so re-renders don't re-run `JSON.parse` and the returned object keeps a stable identity between changes.
- Another tab calling `localStorage.clear()` resets every subscribed key back to its initial value.
- **A value that cannot be persisted is still kept.** In a sandboxed iframe, with third-party storage blocked, or once the quota is full, reading or writing `localStorage` throws — including the property access itself. The hook keeps rendering, and the state it can't write to disk stays in memory, shared across instances of the key for the rest of the session. Freezing the value instead would turn a controlled input into a read-only one with nothing reported anywhere.

## Related

- [useSessionStorage](../useSessionStorage/README.md) — same API, scoped to one tab.
- [useIndexedDB](../useIndexedDB/README.md) — when values outgrow ~5MB or aren't JSON-shaped.

## SSR

Server-renders `initialValue`; the stored value applies right after hydration, with no mismatch.

---

[← All hooks](../../README.md)

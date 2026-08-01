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

Per-tab state that still survives a reload — a wizard step, a draft, a scroll position — where another tab jumping you to _its_ step would be a bug:

```tsx
const [step, setStep] = useLocalStorage('wizard-step', 0, { syncTabs: false });
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

| Option        | Type                   | Default          | Description                                                       |
| ------------- | ---------------------- | ---------------- | ----------------------------------------------------------------- |
| `serialize`   | `(value: T) => string` | `JSON.stringify` | How the value is written.                                         |
| `deserialize` | `(raw: string) => T`   | `JSON.parse`     | How the raw string is read back.                                  |
| `syncTabs`    | `boolean`              | `true`           | Adopt values written by other tabs. `false` keeps this tab's own. |

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
- **`syncTabs: false` scopes the _reactivity_, not the storage.** The key is still shared: the value is read from disk on mount and every write still lands there, where the last writer wins — the tab simply stops adopting values it didn't write, including another tab's `clear()`. It's the right default to turn off for per-tab UI state (wizard step, draft, filters), and the wrong one for anything that must agree across tabs, like auth. For genuinely tab-local state, reach for [useSessionStorage](../useSessionStorage/README.md) instead.
- **`syncTabs` is per hook instance, and instances still share one store per key.** A synced instance and an unsynced one can coexist on the same key; writes made in this tab reach both, cross-tab writes only reach the synced one. What an unsynced instance ignores is missed for as long as it stays mounted — remounting it after every instance of that key unmounted re-reads whatever is on disk by then.
- **A value that cannot be persisted is still kept.** In a sandboxed iframe, with third-party storage blocked, or once the quota is full, reading or writing `localStorage` throws — including the property access itself. The hook keeps rendering, and the state it can't write to disk stays in memory, shared across instances of the key for the rest of the session. Freezing the value instead would turn a controlled input into a read-only one with nothing reported anywhere.

## Related

- [useSessionStorage](../useSessionStorage/README.md) — same API, scoped to one tab.
- [useIndexedDB](../useIndexedDB/README.md) — when values outgrow ~5MB or aren't JSON-shaped.

## SSR

Server-renders `initialValue`; the stored value applies right after hydration, with no mismatch.

---

[← All hooks](../../README.md)

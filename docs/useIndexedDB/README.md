# useIndexedDB

`useState`, but backed by IndexedDB — for data too large or too structured for `localStorage`, synced across every hook instance and every tab.

```ts
import { useIndexedDB } from 'react-kithooks/useIndexedDB';
```

## The problem

`localStorage` caps out around 5MB, stores strings only, and is synchronous — a large JSON blob blocks the main thread on every read. IndexedDB has none of those limits but is famously unpleasant: request-based API, `onupgradeneeded` migrations, no React integration, and — unlike `localStorage` — **no cross-tab event at all**, so two tabs silently drift apart.

This hook gives IndexedDB a `useState` shape: structured clone instead of JSON (`Date`, `Map`, `Set`, `Blob`, `ArrayBuffer` round-trip intact), object stores created on demand, and cross-tab reactivity over `BroadcastChannel`.

## Usage

```tsx
const [items, setItems, removeItems, status] = useIndexedDB<Item[]>('cart-items', []);

if (status === 'loading') return <Spinner />;

await setItems(prev => [...prev, newItem]); // persisted; every tab/component updates
```

Separate stores in one database:

```tsx
const [avatar, setAvatar] = useIndexedDB<Blob | null>('avatar', null, { storeName: 'media' });
const [settings, setSettings] = useIndexedDB('settings', defaults, { storeName: 'prefs' });
```

## API

```ts
function useIndexedDB<T>(
    key: string,
    initialValue: T | (() => T),
    options?: UseIndexedDBOptions
): UseIndexedDBReturn<T>;
```

### Parameters

| Parameter      | Type             | Description                                                                  |
| -------------- | ---------------- | ---------------------------------------------------------------------------- |
| `key`          | `string`         | Record key within the object store.                                          |
| `initialValue` | `T \| (() => T)` | Value returned until the first read resolves, and whenever no record exists. |

### Options

| Option      | Type                       | Default               | Description                                                                                                 |
| ----------- | -------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `dbName`    | `string`                   | `'react-kithooks:db'` | Database name.                                                                                              |
| `storeName` | `string`                   | `'db'`                | Object store name. Created on demand if it doesn't exist.                                                   |
| `onError`   | `(error: unknown) => void` | —                     | Called when a write fails. Also marks the returned promise as handled, which makes `void setValue(…)` safe. |

### Returns

A tuple:

| Position | Name          | Type                                               | Description                                                                                         |
| -------- | ------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `[0]`    | `value`       | `T`                                                | Stored value once loaded, `initialValue` before that.                                               |
| `[1]`    | `setValue`    | `(next: T \| ((prev: T) => T)) => Promise<void>`   | Writes; resolves when the transaction commits.                                                      |
| `[2]`    | `removeValue` | `() => Promise<void>`                              | Deletes the record; the value reverts to `initialValue`.                                            |
| `[3]`    | `status`      | `'loading' \| 'ready' \| 'error' \| 'unsupported'` | Read/write state — tells "still loading" apart from "confirmed absent", and reports a failed write. |

## Notes

- **Reads are async by nature** — IndexedDB has no synchronous read API. `value` holds `initialValue` until the first read resolves; branch on `status` when the difference matters (an empty cart vs. a cart you haven't read yet).
- `setValue` and `removeValue` return promises. Await them when the next step depends on the write having landed.
- **A failed write is reported twice, on purpose.** `status` becomes `'error'`, so a component that never touches the returned promise can still render the failure, and the promise itself rejects for callers that await it. For the fire-and-forget `void setValue(…)` form pass `onError`, otherwise the rejection surfaces as an unhandled one.
- **`initialValue` is never written on mount**, same as [useLocalStorage](../useLocalStorage/README.md) — nothing is written until `setValue` runs.
- **Object stores are created on demand**, including bumping the database version to add a _new_ store to an _existing_ database. Several hooks can share one `dbName` with different `storeName`s without hand-rolled `onupgradeneeded` migrations.
- Writes to a database go through an internal queue, so concurrent `setValue` calls can't collide on a version upgrade.
- **Cross-tab sync uses `BroadcastChannel`**, since IndexedDB fires nothing comparable to the `storage` event. Browsers without it stay correct within their own tab.
- Uses its own database, separate from [useFormCrashRecovery](../useFormCrashRecovery/README.md)'s internal one, so the two features can't bump each other's schema version out from under one another.
- If a version upgrade is blocked by an older connection in another tab, the read fails with `status: 'error'` rather than hanging forever.

## Related

- [useLocalStorage](../useLocalStorage/README.md) — synchronous, ~5MB, JSON only.
- [useFormCrashRecovery](../useFormCrashRecovery/README.md) — purpose-built draft persistence on top of IndexedDB.

## SSR

Server-renders `initialValue` with `status: 'loading'`.

---

[← All hooks](../../README.md)

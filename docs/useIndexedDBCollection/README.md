# useIndexedDBCollection

A live view over a whole IndexedDB object store — cursor reads, batched writes, and queries by index. The collection half of [useIndexedDB](../useIndexedDB/README.md).

```ts
import { useIndexedDBCollection } from 'react-kithooks/useIndexedDBCollection';
```

## The problem

[useIndexedDB](../useIndexedDB/README.md) treats the database as key-value state: one key, one value, `useState` shape. That is the right tool for a cart, a draft, a settings blob.

It is the wrong tool the moment the store holds thousands of records. You reach for IndexedDB precisely because the data is large — and then find yourself with no way to ask "the 50 newest, by date" without reading everything and sorting it in JavaScript, no way to write 500 records without 500 separate transactions, and no way to count without materialising the whole store.

That is what indexes and cursors are for, and this hook exposes them: one cursor per read, one transaction per batch, and schema (`indexes`) declared inline instead of hand-rolled in `onupgradeneeded`.

## Usage

```tsx
const { items, status } = useIndexedDBCollection<Note>({ storeName: 'notes' });
```

Paging through an index, newest first:

```tsx
const [page, setPage] = useState(0);

const { records, status } = useIndexedDBCollection<Note>({
    storeName: 'notes',
    indexes: { byDate: 'createdAt' },
    index: 'byDate',
    direction: 'prev',
    limit: 50,
    offset: page * 50,
});
```

Narrowing with a range — every note by one author:

```tsx
const { items } = useIndexedDBCollection<Note>({
    storeName: 'notes',
    indexes: { byAuthor: 'author' },
    index: 'byAuthor',
    range: IDBKeyRange.only(authorId),
});
```

Batched writes — one transaction, all-or-nothing:

```tsx
const { setMany, removeMany, clear } = useIndexedDBCollection<Note>({ storeName: 'notes' });

await setMany(incoming.map(note => ({ key: note.id, value: note })));
await removeMany(selectedIds);
```

Streaming work too large to render — export, migrate, tally:

```tsx
const { iterate, count } = useIndexedDBCollection<Note>({ storeName: 'notes' });

const total = await count(); // no values read

await iterate(record => {
    stream.write(record.value);

    return !aborted; // return false to stop the cursor early
});
```

## API

```ts
function useIndexedDBCollection<T>(
    options?: UseIndexedDBCollectionOptions
): UseIndexedDBCollectionReturn<T>;
```

### Options

| Option      | Type                                                             | Default               | Description                                                                                                  |
| ----------- | ---------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `dbName`    | `string`                                                         | `'react-kithooks:db'` | Database name.                                                                                               |
| `storeName` | `string`                                                         | `'db'`                | Object store name. Created on demand if it doesn't exist.                                                    |
| `indexes`   | `Record<string, string \| string[] \| IndexedDBIndexDefinition>` | —                     | Indexes the store must have. Created on demand, bumping the database version if the store already exists.    |
| `index`     | `string`                                                         | —                     | Index to read through. Omitted, records come back in primary-key order.                                      |
| `range`     | `IDBKeyRange \| IDBValidKey \| null`                             | —                     | Narrows the read. A bare key matches exactly; use `IDBKeyRange` for bounds.                                  |
| `direction` | `'next' \| 'nextunique' \| 'prev' \| 'prevunique'`               | `'next'`              | Cursor direction. `'prev'` reads newest-first on a date index.                                               |
| `limit`     | `number`                                                         | —                     | Stop after this many records. The cursor stops there — later records are never read.                         |
| `offset`    | `number`                                                         | `0`                   | Skip this many records first, via `cursor.advance`.                                                          |
| `onError`   | `(error: unknown) => void`                                       | —                     | Called when a read or write fails. Also marks write promises as handled, which makes `void setMany(…)` safe. |

### Returns

| Name         | Type                                                               | Description                                                                             |
| ------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `items`      | `T[]`                                                              | Matched values, in cursor order.                                                        |
| `records`    | `{ key: IDBValidKey; value: T }[]`                                 | The same results with their primary keys — what you want for list keys and edits.       |
| `status`     | `'loading' \| 'ready' \| 'error' \| 'unsupported'`                 | Read state of the current query.                                                        |
| `refresh`    | `() => Promise<void>`                                              | Re-runs the query. Rarely needed — writes refresh it automatically.                     |
| `get`        | `(key: string) => Promise<T \| undefined>`                         | Reads one record by primary key, ignoring the query.                                    |
| `getMany`    | `(keys: readonly string[]) => Promise<(T \| undefined)[]>`         | Reads a batch in one transaction; results line up with the keys asked for.              |
| `set`        | `(key: string, value: T) => Promise<void>`                         | Writes one record.                                                                      |
| `setMany`    | `(records: readonly { key: string; value: T }[]) => Promise<void>` | Writes a batch in one transaction.                                                      |
| `remove`     | `(key: string) => Promise<void>`                                   | Deletes one record.                                                                     |
| `removeMany` | `(keys: readonly string[]) => Promise<void>`                       | Deletes a batch in one transaction.                                                     |
| `clear`      | `() => Promise<void>`                                              | Empties the object store.                                                               |
| `count`      | `(options?: { index?, range? }) => Promise<number>`                | Counts matching records without reading their values. Defaults to the hook's own query. |
| `iterate`    | `(visit: (record) => boolean \| void) => Promise<void>`            | Walks the cursor one record at a time. Return `false` to stop early.                    |

## Notes

- **`limit`/`offset` are cursor-level, not array-level.** A `limit` of 50 stops the cursor after 50 records; the rest of the store is never read into memory. That is the whole point of using this over reading everything and slicing.
- **Indexes are declared, not migrated.** Passing `indexes` creates the store — or bumps the database version and adds the index to an existing store — on demand, the same way `useIndexedDB` creates stores. Existing records are re-indexed by the browser during the upgrade, so adding an index to a populated store is safe.
- **Removing an index from `indexes` does not drop it.** The declaration is a floor ("these must exist"), not an exact schema. Nothing is ever deleted from the store's schema.
- **Batched writes are all-or-nothing.** `setMany` and `removeMany` run in a single transaction: if one record fails — unclonable value, quota — the transaction aborts and _nothing_ in the batch is applied. Half-written batches are not a state you have to handle.
- **Writes refresh every reader.** A write from this hook, or from a [useIndexedDB](../useIndexedDB/README.md) pointed at the same store, refreshes both — in this tab and in every other tab on the origin, over `BroadcastChannel`.
- **A failed read keeps the last good `records`** and sets `status: 'error'`, so a list doesn't blank out on a transient failure.
- **Changing the query re-reads.** `status` returns to `'loading'` while the new query runs and `records` keeps the previous results, so a paging list doesn't flash empty. The query is compared by value, not identity — a fresh `IDBKeyRange.only(id)` object each render does not re-trigger the read.
- **`iterate` and `count` use the hook's query** (`index`, `range`, `direction`, and for `iterate` also `limit`/`offset`) unless you pass overrides to `count`.
- **Values are stored with out-of-line keys**, like `useIndexedDB` — the key you pass is the primary key, and index `keyPath`s point into the stored value.

## Related

- [useIndexedDB](../useIndexedDB/README.md) — one key held as `useState`-shaped state. Same database, same cross-tab sync.
- [useLocalStorage](../useLocalStorage/README.md) — synchronous, ~5MB, JSON only.

## SSR

Server-renders `status: 'loading'` with empty `items`/`records`. The first read runs in an effect.

---

[← All hooks](../../README.md)

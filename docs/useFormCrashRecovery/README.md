# useFormCrashRecovery

Debounced persistence of form state to IndexedDB, so a long form survives a tab crash, an accidental close, or a mistaken back-navigation. **Never auto-restores** — you decide how to offer the draft back.

```ts
import { useFormCrashRecovery } from 'react-kithooks/useFormCrashRecovery';
import { useFormCrashRecoveryRHF } from 'react-kithooks/useFormCrashRecovery/rhf';
```

## The problem

Autosaving a draft to `localStorage` sounds simple until it isn't: `JSON.stringify` turns `Date` into a string and destroys `File`/`Blob` entirely, there's a ~5MB cap, nothing expires, a card number ends up on disk, an old draft in a new schema restores garbage into the form, and two tabs editing the same entity overwrite each other silently.

This hook stores drafts in IndexedDB via structured clone (`Date`, `File`, `Blob`, `Map`, `Set` survive), with TTL expiry, schema versioning, explicit field exclusion, and cross-tab conflict detection.

## Usage

```tsx
const [draft, setDraft] = useState({ title: '', cardNumber: '' });

const { recovered, restore, discard, clear } = useFormCrashRecovery(draft, {
    key: 'invoice-draft',
    exclude: ['cardNumber'], // never hits disk
    ttlMs: 24 * 60 * 60 * 1000,
});

{
    recovered && (
        <RestoreBanner
            savedAt={recovered.savedAt}
            onRestore={() => setDraft(d => ({ ...d, ...restore() }))}
            onDismiss={discard}
        />
    );
}

// after a successful submit:
await clear();
```

### react-hook-form

RHF users get a prebuilt adapter from a dedicated subpath — the only module in the package that imports the optional peer, so everyone else never loads it:

```tsx
import { useFormCrashRecoveryRHF } from 'react-kithooks/useFormCrashRecovery/rhf';

const { control, reset } = useForm<Invoice>();
const { recovered, applyRecovered, clear } = useFormCrashRecoveryRHF(control, { key: 'invoice' });

{
    recovered && <button onClick={() => applyRecovered(reset)}>Restore draft</button>;
}
```

`applyRecovered(reset)` deep-merges the draft over the current values (only defined fields win) and calls `reset(merged, { keepDefaultValues: true })`, so dirty-state and validation stay coherent.

## API

```ts
function useFormCrashRecovery<T extends Record<string, unknown>>(
    value: T,
    options: UseFormCrashRecoveryOptions
): UseFormCrashRecoveryReturn<T>;
```

### Options

| Option             | Type                                          | Default             | Description                                                                         |
| ------------------ | --------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| `key`              | `string`                                      | — (required)        | Draft identity. Namespace it per entity (`invoice:42`) so two forms can't collide.  |
| `debounceMs`       | `number`                                      | `500`               | Quiet period before a write.                                                        |
| `ttlMs`            | `number`                                      | `86400000` (24h)    | How long a draft stays restorable. Expired drafts are deleted on read.              |
| `exclude`          | `string[]`                                    | `[]`                | Dot-paths never written to disk: `['cardNumber', 'payment.cvv', 'items.0.secret']`. |
| `version`          | `number`                                      | `1`                 | Schema version. A stored draft with a different version is discarded, not restored. |
| `conflictStrategy` | `'last-write-wins' \| 'first-tab-wins'`       | `'last-write-wins'` | What happens when another tab writes the same key.                                  |
| `onConflict`       | `(info: { otherTabSavedAt: number }) => void` | —                   | Notified when another tab writes this draft.                                        |
| `disabled`         | `boolean`                                     | `false`             | Turn persistence and recovery off entirely.                                         |

### Returns

| Field         | Type                        | Description                                                                              |
| ------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| `recovered`   | `RecoveredDraft<T> \| null` | `{ data, savedAt }` when a valid draft exists, else `null`. Never applied automatically. |
| `status`      | `RecoveryStatus`            | `'idle'` \| `'restoring'` \| `'saving'` \| `'saved'` \| `'unsupported'` \| `'error'`     |
| `restore`     | `() => T \| null`           | Returns the draft data and clears `recovered`. You apply it to your state.               |
| `discard`     | `() => Promise<void>`       | Drops the offered draft and deletes it from storage.                                     |
| `clear`       | `() => Promise<void>`       | Cancels pending writes and deletes the record — call after a successful submit.          |
| `lastSavedAt` | `number \| null`            | Timestamp of the last successful write, for a "saved 2s ago" indicator.                  |

## Notes

- **Persistence pauses while a draft is on offer.** As long as `recovered` is non-null, typing does not overwrite the stored draft — otherwise the recovered copy would be destroyed by the empty form rendered next to the banner. Call `restore()` or `discard()` to resume saving.
- **Nothing is restored without you.** `recovered` is data plus a timestamp; applying it is your call, which is what makes "Restore draft?" UI possible at all.
- Writes are flushed on `visibilitychange` → hidden, on `pagehide`, on unmount, and on a `key` change — the paths a crash or close actually takes. The in-flight write is captured with the key it was scheduled for, so changing `key` mid-debounce can't write the new form's values under the old key.
- **`exclude` paths never reach disk**, not even briefly — they're stripped before the record is built. Use it for card numbers, CVVs, passwords, tokens.
- If a value can't be structured-cloned, the write retries with the offending fields dropped and, in development, logs a `console.warn` naming them — exclude them explicitly to silence it. The warning is addressed to whoever wrote the form, so it is dropped from production builds.
- On `QuotaExceededError` persistence stops for the rest of the session rather than throwing on every keystroke; `status` goes `'error'`.
- **Conflicts**: `'last-write-wins'` just calls `onConflict` and keeps saving. `'first-tab-wins'` additionally stops _this_ tab from persisting if another tab wrote first and this one hasn't written yet.
- Drafts live in their own database (`react-kithooks:drafts`), separate from [useIndexedDB](../useIndexedDB/README.md)'s, so the two can't bump each other's schema version. Expired records across all keys are swept once per session.

## SSR

Server-renders as `{ recovered: null, status: 'idle' }`; IndexedDB is only touched in effects.

---

[← All hooks](../../README.md)

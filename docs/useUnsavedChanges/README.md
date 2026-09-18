# useUnsavedChanges

Warns before a page with an unsaved form is closed — **without** taking the page out of the back/forward cache for the rest of the session.

```ts
import { useUnsavedChanges } from 'react-kithooks/useUnsavedChanges';
```

## The problem

The usual version registers `beforeunload` once, on mount:

```tsx
useEffect(() => {
    const warn = e => {
        e.preventDefault();
    };

    window.addEventListener('beforeunload', warn);

    return () => window.removeEventListener('beforeunload', warn);
}, []);
```

Two things go wrong:

- **It costs the bfcache.** Chrome will not put a page with a `beforeunload` listener into the back/forward cache, so every Back button in the session reloads the whole app instead of restoring it in place — a permanent cost paid for a dialog the user will probably never see. Attaching the listener only while the form is actually dirty gives that back.
- **It never fires on a route change.** `beforeunload` is about leaving the _document_. A client-side navigation is not one, so the SPA case — the common case — is not covered at all, and the user loses the draft with no warning.

This hook attaches while `isDirty` and hands you `confirmLeave()` for the router half.

## Usage

```tsx
function EditPost() {
    const form = useForm();

    useUnsavedChanges(form.formState.isDirty);

    return <form>…</form>;
}
```

React Router, which asks a blocker whether to proceed:

```tsx
const { confirmLeave } = useUnsavedChanges(isDirty);

useBlocker(() => !confirmLeave());
```

Next.js pages router:

```tsx
const { confirmLeave } = useUnsavedChanges(isDirty);

useEffect(() => {
    const guard = () => {
        if (!confirmLeave()) throw 'route change aborted';
    };

    router.events.on('routeChangeStart', guard);

    return () => router.events.off('routeChangeStart', guard);
}, [confirmLeave, router]);
```

Ask in your own dialog instead of `window.confirm` — anything that answers synchronously:

```tsx
const { confirmLeave } = useUnsavedChanges(isDirty, {
    message: 'Your draft has not been saved.',
    onNavigate: message => myConfirmSync(message),
});
```

## API

```ts
function useUnsavedChanges(
    isDirty: boolean,
    options?: UseUnsavedChangesOptions
): UseUnsavedChangesReturn;
```

### Options

| Option       | Type                           | Default                                        | Description                                                      |
| ------------ | ------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------- |
| `message`    | `string`                       | `'You have unsaved changes. Leave this page?'` | Passed to `confirmLeave`'s prompt, and set on the unload event.  |
| `onNavigate` | `(message: string) => boolean` | `window.confirm`                               | Ask in your own UI. Return `true` to let the navigation through. |

### Returns

| Field          | Type            | Description                                                                |
| -------------- | --------------- | -------------------------------------------------------------------------- |
| `isDirty`      | `boolean`       | What you passed in, so a blocker can read one object.                      |
| `confirmLeave` | `() => boolean` | `true` when it is safe to navigate. Never asks when the form is not dirty. |

`confirmLeave` keeps one identity for the life of the component, so it is safe in a dependency array.

## Notes

- Browsers have ignored the custom `beforeunload` text since 2016 — the wording is Chrome's, Firefox's, Safari's. `message` is still sent, for the handful of embedded browsers that read it, and it is what `confirmLeave` asks with, which is the place it does show.
- Some browsers only show the native dialog if the user has interacted with the page. That is their rule, not this hook's.
- The listener is attached in an effect, so it never runs on the server and it goes on unmount.
- Pair with [useFormCrashRecovery](../useFormCrashRecovery/README.md): this one asks before the user leaves on purpose, that one gets the draft back when they did not.

## SSR

`confirmLeave()` returns `true` on the server — there is nothing to leave — and nothing touches `window` until effects run.

---

[← All hooks](../../README.md)

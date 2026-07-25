# react-kithooks

Production-grade React hooks for the hard 10% of browser UI — scroll anchoring, permissions, layered keyboard shortcuts, crash-safe form drafts, multi-tab-synced localStorage state, real (not just `navigator.onLine`) connectivity, race-free abortable fetching — plus the small utilities every app rewrites (debounce, media queries, render bookkeeping) with their known failure modes fixed.

Each hook exists because the naive version has a known failure mode — viewport jumps when chat history loads, permission prompts that can't be re-asked, every modal closing on one Escape, form drafts destroyed by JSON serialization.

- **TypeScript-first**, ESM + CJS, `sideEffects: false`
- **SSR-safe** (Next.js App Router) — every hook is import-safe and first-render-stable on the server
- **Zero runtime dependencies** (react-hook-form is an optional peer used only by one opt-in subpath)

## Install

```sh
npm install react-kithooks
```

Prefer per-hook subpath imports — guaranteed zero-overhead, no barrel in your bundle:

```ts
import { useScrollAnchor } from 'react-kithooks/useScrollAnchor';
import { usePermission } from 'react-kithooks/usePermission';
import { useKeyboardScope } from 'react-kithooks/useKeyboardScope';
import { useFormCrashRecovery } from 'react-kithooks/useFormCrashRecovery';
import { useLocalStorage } from 'react-kithooks/useLocalStorage';
import { useSessionStorage } from 'react-kithooks/useSessionStorage';
import { useIndexedDB } from 'react-kithooks/useIndexedDB';
import { useOnlineStatus } from 'react-kithooks/useOnlineStatus';
import { useAbortableFetch } from 'react-kithooks/useAbortableFetch';
import { useDebouncedValue } from 'react-kithooks/useDebouncedValue';
import { useDebouncedCallback } from 'react-kithooks/useDebouncedCallback';
import { useMediaQuery } from 'react-kithooks/useMediaQuery';
import { useIsFirstRender } from 'react-kithooks/useIsFirstRender';
import { usePreviousValue } from 'react-kithooks/usePreviousValue';
```

## useScrollAnchor

Prevents viewport jump when prepending items to a scrollable list (loading older chat messages), and sticks to the bottom on append only while the user is already near the bottom. Uses element anchoring — not `scrollHeight` diffing — so async content (images decoding above the anchor) doesn't break the position. Works in Safari, which has no native `overflow-anchor`.

```tsx
const { ref, isAtBottom, prepend, scrollToBottom } = useScrollAnchor();

<div ref={ref} className="messages">
    {messages.map(/* … */)}
</div>;

// loading older messages — no viewport jump:
prepend(() => setMessages([...older, ...messages]));
```

If you only need stick-to-bottom for appended content, [use-stick-to-bottom](https://github.com/stackblitz-labs/use-stick-to-bottom) is excellent; use this hook when you also load history upward.

## usePermission

One reactive hook over the fragmented permission APIs: query via the Permissions API where it exists, request via the per-permission native API (`getUserMedia`, `Notification.requestPermission`, …), graceful fallbacks where it doesn't (Safari, Firefox `clipboard-read`).

```tsx
const { status, isGranted, isDenied, request } = usePermission('camera');
// status: 'granted' | 'denied' | 'prompt' | 'unsupported' | 'loading'
```

- `request()` never throws for a denial — it resolves to the resulting status. Call it from a user gesture (Safari requirement).
- The camera/mic probe always stops its tracks — no camera light left on.
- `isDenied` on Chromium means re-requesting will not prompt again: show "enable in browser settings" UI. Safari masks camera/mic `denied` as `prompt` until `getUserMedia` has run this session.

## useKeyboardScope

Stack-based shortcut scoping for layered UI. The most recently activated scope suspends everything below it; **Escape only ever reaches the top-most layer.** No provider needed for the common case.

```tsx
// page level
useKeyboardScope({ 'mod+k': openPalette });

// inside a modal — while mounted, page shortcuts are suspended
useKeyboardScope({ 'mod+enter': submit }, { onEscape: closeModal });
```

- `'mod'` resolves to ⌘ on macOS, Ctrl elsewhere; `'code:KeyQ'` matches the physical key on non-Latin layouts.
- IME composition events are ignored; form elements are skipped unless a binding opts in via `enableOnFormElements`.
- `passthrough: true` lets unmatched keys fall through to the parent scope (Escape never falls through).
- `KeyboardScopeProvider` is optional — use it for shadow DOM, custom event targets, or multiple React roots.

## useFormCrashRecovery

Debounced persistence of form state to IndexedDB so drafts survive tab crashes and accidental closes. Structured clone (Dates and Files survive — no JSON mangling), TTL expiry, versioning, sensitive-field exclusion, multi-tab conflict handling. **Never auto-restores** — you show a "Restore draft?" affordance.

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
// call clear() after successful submit
```

Works with any plain state object. react-hook-form users get a prebuilt adapter from a dedicated subpath (the only module that imports the optional peer):

```tsx
import { useFormCrashRecoveryRHF } from 'react-kithooks/useFormCrashRecovery/rhf';

const { control, reset } = useForm<Invoice>();
const { recovered, applyRecovered } = useFormCrashRecoveryRHF(control, { key: 'invoice' });
// applyRecovered(reset) merges the draft via reset(…, { keepDefaultValues: true })
```

## useLocalStorage

`useState`, but backed by `localStorage` and kept in sync across every tab/window on the same origin via the native `storage` event — plus across every hook instance in the current tab, which the native event never covers.

```tsx
const [count, setCount, removeCount] = useLocalStorage('count', 0);

setCount(c => c + 1); // persisted, and every other tab/component sees it update
removeCount(); // clears the key, reverts to the initial value
```

- Never writes `initialValue` into storage on mount — it's only the fallback while the key is absent or unparsable. Nothing is written until `setValue` runs.
- Corrupted/hand-edited storage, and a full storage quota on write, both fall back gracefully instead of throwing.
- Custom `{ serialize, deserialize }` for values `JSON` can't round-trip (Dates, `Map`/`Set`, …); defaults to `JSON.stringify`/`JSON.parse`.
- Another tab calling `localStorage.clear()` resets every subscribed key back to its initial value.

## useSessionStorage

Same hook, same API, `sessionStorage` instead — scoped to the current tab (cleared when it closes, never shared with a freshly-opened tab). Same failure-mode fixes as `useLocalStorage` (parse errors fall back to `initialValue`, same-tab instances stay in sync), sharing one internal implementation with it so the two can't drift apart.

```tsx
const [draftId, setDraftId, clearDraftId] = useSessionStorage('draft-id', null);
```

- Use this over `useLocalStorage` for state that shouldn't outlive the tab — a wizard step, a one-time redirect flag, a per-checkout-session id.
- The native `storage` event still fires for same-origin frames/popups that share this tab's session storage area, so this hook stays reactive there too; it just never crosses into an unrelated tab.

## useIndexedDB

`useState`, but backed by IndexedDB — for data too large or too structured for `localStorage`'s ~5MB/string-only limits (blobs, large lists, `Date`/`Map`/`Set`, anything structured-clone supports). Reactive across every hook instance in the current tab and across other tabs via `BroadcastChannel`, since IndexedDB fires no native cross-tab event the way `localStorage` does.

```tsx
const [items, setItems, removeItems, status] = useIndexedDB<Item[]>('cart-items', []);

if (status === 'loading') return <Spinner />;

setItems(prev => [...prev, newItem]); // persisted, and every other tab/component sees it update
```

- Reads are inherently async — `value` holds `initialValue` until the first read resolves; `status` (`'loading' | 'ready' | 'error' | 'unsupported'`) tells you when it has.
- Never writes `initialValue` into storage on mount, same as `useLocalStorage` — nothing is written until `setValue` runs.
- The backing object store is created on demand, including bumping the database version to add a _new_ store to an _existing_ database, so several hooks can share one `dbName` with different `storeName`s without hand-rolled `onupgradeneeded` migrations.
- Uses its own database (`"react-kithooks-kv"` by default) — separate from `useFormCrashRecovery`'s internal one, so the two features can't bump each other's schema version out from under one another.

## useOnlineStatus

Reactive `navigator.onLine`, corrected for its known false positive: it reports "online" whenever the network interface is up, even with no actual internet access (captive portal, unplugged router). Pass `pingUrl` for a lightweight same-origin HEAD request that re-verifies real connectivity.

```tsx
const { isOnline, recheck } = useOnlineStatus({ pingUrl: '/api/ping' });

{
    !isOnline && <OfflineBanner onRetry={recheck} />;
}
```

- Without `pingUrl`, trusts `navigator.onLine` alone (debounced against event flapping).
- With `pingUrl`, checks on mount, on an interval while the tab is visible (`pingIntervalMs`, default 30s), and on demand via `recheck()`.
- Shared across every hook instance on the page — one connectivity fact, not one per component.

## useAbortableFetch

Fixes the race condition in `useEffect(() => { fetch(url).then(setData) }, [id])`: when `id` changes quickly, a slow earlier request can resolve _after_ the newer one and overwrite fresh state with stale data. This hook aborts the previous call on every dep change and unmount, and ignores any response that arrives after it was superseded even when the underlying async work doesn't honor `AbortSignal`.

```tsx
const { data, isLoading, error } = useAbortableFetch(
    signal => fetch(`/api/users/${userId}`, { signal }).then(r => r.json()),
    [userId]
);
```

- `status`: `'idle' | 'loading' | 'success' | 'error'`. An `AbortError` never surfaces as `'error'`.
- `enabled: false` skips the fetcher — useful while a dependency (like `userId`) isn't ready yet.
- `refetch()` re-runs the fetcher on demand, aborting any in-flight call first.

## useDebouncedValue

Returns the value once it has stopped changing for `delayMs`. Cancels the pending update on unmount (no setState-after-unmount), and — unlike most implementations — when the value reverts to the current one within the window (type-and-undo produces no update at all).

```tsx
const [query, setQuery] = useState('');
const debouncedQuery = useDebouncedValue(query, 300);
// pass debouncedQuery to useAbortableFetch deps — search fires once per pause
```

## useDebouncedCallback

Debounced function with a stable identity — safe in effect deps and memoized children. When it fires, it calls the **latest** `fn` (no stale closure over old props/state) with the args of the last call. Auto-cancels on unmount.

```tsx
const save = useDebouncedCallback(draft => api.save(draft), 500);

save(draft); // restarts the 500ms window on each call
save.flush(); // run the pending call now (e.g. on blur)
save.cancel(); // drop it
save.isPending(); // is a call waiting?
```

## useMediaQuery

Reactive `window.matchMedia(query).matches`, SSR-safe: the naive `useState(matchMedia(...).matches)` throws on the server and hydration-mismatches on the client. Built on `useSyncExternalStore`, so the hydration pass consistently renders `serverFallback` and the real value applies immediately after. Falls back to the legacy `addListener` API on Safari < 14.

```tsx
const isDesktop = useMediaQuery('(min-width: 768px)');
const prefersReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
```

- `serverFallback` (default `false`): what the server and hydration pass render — pick the value matching the majority of your first paints to minimize the post-hydration re-render.

## useIsFirstRender

`true` during the initial render pass, `false` after mount. The common implementation flips a ref during render — under StrictMode's dev double-render the second pass reports `false`, so dev and prod diverge (an intro animation skipped only in dev). This one flips in an effect: every pre-mount render pass is consistently `true`.

```tsx
const isFirstRender = useIsFirstRender();
// e.g. skip the enter animation on initial mount, animate on later changes
```

## usePreviousValue

The previous **distinct** value — what it was before it last changed (`Object.is`), or `undefined` before the first change. The classic `useEffect(() => { ref.current = value })` overwrites on every commit, so after any unrelated re-render "previous" equals the current value and `prev !== value` comparisons silently stop working.

```tsx
const prevStatus = usePreviousValue(status);
if (prevStatus === 'loading' && status === 'error') showRetryToast();
```

## SSR / Next.js

All hooks touch `window`/`document`/`navigator` only inside effects or callback refs. Server-render values: `usePermission` → `'loading'`, `useScrollAnchor.isAtBottom` → `true`, `useKeyboardScope.isTopMost` → `false`, `useFormCrashRecovery` → `{ recovered: null, status: 'idle' }`, `useLocalStorage`/`useSessionStorage` → `initialValue`, `useIndexedDB` → `initialValue` with `status: 'loading'`, `useOnlineStatus.isOnline` → `true`, `useAbortableFetch.status` → `'idle'`, `useDebouncedValue` → the current value, `useMediaQuery` → `serverFallback`, `useIsFirstRender` → `true`, `usePreviousValue` → `undefined`. No hydration mismatches.

## License

MIT

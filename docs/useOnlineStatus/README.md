# useOnlineStatus

Reactive `navigator.onLine`, corrected for its known false positive — optionally verified with a real request.

```ts
import { useOnlineStatus } from 'react-kithooks/useOnlineStatus';
```

## The problem

`navigator.onLine` doesn't mean "has internet". It means "a network interface is up". Connected to a captive portal in a hotel, plugged into a router with a dead uplink, on VPN-only DNS — all report `true`. Users see an app that thinks it's online while every request fails.

The only reliable check is making a request. This hook layers that over the browser signal: `navigator.onLine` for instant negatives (it's trustworthy when it says _offline_), a lightweight `HEAD` ping to confirm the positives.

## Usage

```tsx
const { isOnline, recheck } = useOnlineStatus({ pingUrl: '/api/ping' });

{
    !isOnline && <OfflineBanner onRetry={recheck} />;
}
```

Without verification, when the browser signal is enough:

```tsx
const { isOnline } = useOnlineStatus();
```

Gate a submit on a fresh check:

```tsx
const submit = async () => {
    if (!(await recheck())) return showOfflineToast();
    await api.save(draft);
};
```

## API

```ts
function useOnlineStatus(options?: UseOnlineStatusOptions): UseOnlineStatusReturn;
```

### Options

| Option           | Type     | Default | Description                                                                                            |
| ---------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `pingUrl`        | `string` | —       | Endpoint for a `HEAD` request that verifies real connectivity. Omit to trust `navigator.onLine` alone. |
| `pingIntervalMs` | `number` | `30000` | How often to re-verify while the tab is visible.                                                       |
| `pingTimeoutMs`  | `number` | `5000`  | A ping slower than this counts as offline.                                                             |

### Returns

| Field      | Type                     | Description                                                          |
| ---------- | ------------------------ | -------------------------------------------------------------------- |
| `isOnline` | `boolean`                | Current connectivity.                                                |
| `recheck`  | `() => Promise<boolean>` | Runs a ping now and resolves to the result. No-op without `pingUrl`. |

## Notes

- **The ping is a `no-cors` HEAD request.** A cross-origin endpoint without CORS headers would otherwise reject exactly like a dead network, and the hook would report a perfectly good connection as offline — the easiest way to misconfigure this, and one that fails silently. The opaque response is enough: the question is whether the request completed at all. Same-origin URLs are unaffected.

- **Pick a cheap, same-origin `pingUrl`** — the request is `HEAD` with `cache: 'no-store'`, so it must not be cached and shouldn't do real work. A cross-origin URL works only if CORS allows it; a blocked request is indistinguishable from being offline.
- With `pingUrl`, checks run on mount, on an interval **while the tab is visible**, when it becomes visible again, and on demand via `recheck()`. Background tabs don't burn requests.
- Overlapping pings are sequence-checked: a slow earlier response can't overwrite a newer verdict.
- Browser `online`/`offline` events are debounced by 300ms — interface flapping doesn't turn into a flickering banner.
- **State is shared across every hook instance on the page** — one connectivity fact, not one per component, so a dozen components can subscribe without a dozen ping loops.

## SSR

`isOnline` server-renders as `true`.

---

[← All hooks](../../README.md)

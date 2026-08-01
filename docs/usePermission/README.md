# usePermission

One reactive hook over the fragmented browser permission APIs — query, request, and live status updates for camera, microphone, geolocation, notifications, clipboard and persistent storage.

```ts
import { usePermission } from 'react-kithooks/usePermission';
```

## The problem

There is no single permission API. The Permissions API can _query_ status but never _request_ it, and its support is uneven — Safari doesn't implement it for camera/microphone, Firefox doesn't for `clipboard-read`. Requesting goes through a different API per permission (`getUserMedia`, `Notification.requestPermission`, `geolocation.getCurrentPosition`, `clipboard.readText`), each with its own error shape and its own idea of what a denial looks like.

This hook normalizes all of that into one status value plus one `request()`, with graceful fallbacks where the platform gives you nothing.

## Usage

```tsx
const { status, isGranted, isDenied, request } = usePermission('camera');

if (isDenied) return <p>Enable camera access in your browser settings.</p>;

return <button onClick={request}>Enable camera</button>;
```

## API

```ts
function usePermission(name: PermissionKind): UsePermissionReturn;
```

### Parameters

| Parameter | Type             | Description                          |
| --------- | ---------------- | ------------------------------------ |
| `name`    | `PermissionKind` | One of the kinds in the table below. |

### Permission kinds

| Kind                   | How `request()` asks                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| `'camera'`             | `getUserMedia({ video: true })`, tracks stopped immediately.                 |
| `'microphone'`         | `getUserMedia({ audio: true })`, tracks stopped immediately.                 |
| `'geolocation'`        | `getCurrentPosition()`.                                                      |
| `'notifications'`      | `Notification.requestPermission()`.                                          |
| `'clipboard-read'`     | `clipboard.readText()`.                                                      |
| `'clipboard-write'`    | Nothing — status only. See the note below.                                   |
| `'persistent-storage'` | `navigator.storage.persist()`, asking the browser not to evict your storage. |

### Returns

| Field       | Type                                | Description                                                               |
| ----------- | ----------------------------------- | ------------------------------------------------------------------------- |
| `status`    | `PermissionStatusEx`                | `'granted'` \| `'denied'` \| `'prompt'` \| `'unsupported'` \| `'loading'` |
| `isGranted` | `boolean`                           | `status === 'granted'`                                                    |
| `isDenied`  | `boolean`                           | `status === 'denied'`                                                     |
| `request`   | `() => Promise<PermissionStatusEx>` | Triggers the native prompt; resolves to the resulting status.             |

## Notes

- **`request()` never throws for a denial.** It resolves to the resulting status — a rejected prompt is a value, not an exception. Call it from a user gesture (Safari requires one).
- **The camera/mic probe always stops its tracks.** Requesting `camera` opens a `getUserMedia` stream to find out the answer and immediately stops every track — no camera light left on.
- **`isDenied` is terminal on Chromium**: re-requesting will not prompt again, so show "enable in browser settings" UI rather than another button that does nothing.
- **Safari masks camera/mic `denied` as `prompt`** until `getUserMedia` has actually run this session — the first `request()` is what surfaces the real answer.
- **Geolocation**: only `PERMISSION_DENIED` counts as a denial, and only an actual fix counts as a grant. A timeout can fire while the prompt is still open, and position-unavailable (no GPS indoors) says nothing about permission — neither is written to the status. Where the Permissions API exists it decides; where it doesn't (Safari), the honest answer stays `'prompt'`.
- **`request('clipboard-write')` never writes anything.** The only way to actually exercise that permission is to perform a write, which would destroy whatever the user has copied — never an acceptable price for answering a status question. It reports the queried status instead; Chromium auto-grants clipboard-write to the focused document anyway.
- **`'persistent-storage'` is worth asking for if you use [useIndexedDB](../useIndexedDB/README.md) or [useFormCrashRecovery](../useFormCrashRecovery/README.md)** — without it the browser may evict your origin's storage under disk pressure, taking crash-recovery drafts with it. A refused `persist()` reports `'prompt'`, not `'denied'`: Chromium decides it from site-engagement heuristics and can grant it later unprompted. Where the Permissions API has no entry for it (Safari), `navigator.storage.persisted()` answers instead.
- **`'unsupported'`** means the platform has no API for this permission at all — treat it as "don't show the affordance", not as a denial.
- Status is shared per permission kind across every component that asks for it, and stays live: native `PermissionStatus.onchange` updates it, and it re-queries when the tab becomes visible again (so a change made in browser settings while you were away is picked up).

## SSR

Server-renders as `'loading'`; the real status resolves after mount.

---

[← All hooks](../../README.md)

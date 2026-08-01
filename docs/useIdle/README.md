# useIdle

Reports whether the user has stopped interacting with the page for a given time — for session timeouts, "are you still there?" prompts, and pausing work nobody is watching.

```ts
import { useIdle } from 'react-kithooks/useIdle';
```

## The problem

The naive version is a `setTimeout` that every `mousemove` clears and re-arms. It gets four things wrong:

- **The timer lies.** A hidden tab has its timers clamped to ≥1s (and Chrome freezes them outright after a few minutes), and a sleeping laptop stops them entirely. A timer that fired proves nothing about how much time actually passed — and one that hasn't fired doesn't mean it hasn't.
- **Re-arming on every event is churn.** `mousemove` alone fires 60–100×/second, each one a `clearTimeout` + `setTimeout` pair, and in most implementations a React state update too.
- **`stopPropagation()` hides real activity.** Modals, editors, and inputs routinely stop keydown from bubbling. A bubble-phase listener never sees it, so the app can decide someone actively typing is idle.
- **Other tabs don't count.** Two tabs open, you work in one — the other logs you out, and takes the session with it.

This hook records activity from capture-phase listeners, notifies React only on a throttle, and always decides idleness by comparing wall-clock timestamps — re-checking when the tab becomes visible again or is restored from bfcache.

## Usage

```tsx
const { isIdle } = useIdle(5 * 60_000);

if (isIdle) return <AreYouStillThere />;
```

A session timeout with a warning first — two instances, one activity stream:

```tsx
function SessionGuard() {
    const { isIdle: showWarning } = useIdle(13 * 60_000);
    const { isIdle: expired } = useIdle(15 * 60_000, {
        syncAcrossTabs: true,
        onIdle: () => logout(),
    });

    return showWarning && !expired ? <SessionWarning /> : null;
}
```

## API

```ts
function useIdle(timeoutMs: number, options?: UseIdleOptions): UseIdleReturn;
```

### Parameters

| Parameter   | Type     | Description                                     |
| ----------- | -------- | ----------------------------------------------- |
| `timeoutMs` | `number` | Inactivity after which the user counts as idle. |

### Options

| Option           | Type                | Default   | Description                                                                                                 |
| ---------------- | ------------------- | --------- | ----------------------------------------------------------------------------------------------------------- |
| `events`         | `readonly string[]` | see below | Which `window` events count as activity. Compared by content, so a fresh array literal each render is fine. |
| `idleOnHidden`   | `boolean`           | `false`   | Treat a backgrounded tab as idle immediately, instead of letting the timeout run.                           |
| `syncAcrossTabs` | `boolean`           | `false`   | Activity in any tab of the app keeps every tab active.                                                      |
| `enabled`        | `boolean`           | `true`    | `false` stops tracking and reports `isIdle: false`.                                                         |
| `onIdle`         | `() => void`        | —         | Called on the transition into idle.                                                                         |
| `onActive`       | `() => void`        | —         | Called on the transition back out.                                                                          |

Default `events`: `mousemove`, `mousedown`, `keydown`, `wheel`, `touchstart`, `touchmove`, `scroll`.

### Returns

| Field           | Type           | Description                                                                                                                                         |
| --------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isIdle`        | `boolean`      | Whether the user has been inactive for `timeoutMs`.                                                                                                 |
| `reset`         | `() => void`   | Mark the user active now — for activity your events don't cover (a finished upload, say).                                                           |
| `getLastActive` | `() => number` | Timestamp of the last recorded activity. A stable function, not reactive state — read it inside a countdown interval rather than rendering from it. |

## Notes

- **Idleness is always a wall-clock comparison.** The internal timer only decides _when to look_; if it fires early it reschedules, and if the clock jumped past the timeout while it never fired at all, the next visibility change or `pageshow` catches it.
- **Listeners are shared.** Every instance using the same event set shares one set of DOM listeners; each keeps its own timeout, so several thresholds cost one listener each way. Listeners attach on first subscriber and detach on the last.
- **Capture phase, `passive: true`** — activity is observed before anything can stop propagation, and never blocks scrolling.
- **React sees throttled notifications, not the firehose.** The timestamp is recorded on every event; subscribers are notified at most every 500ms, leading edge first, so coming back from idle is immediate.
- **`syncAcrossTabs` uses `BroadcastChannel`**, throttled to one message per 2s while active. That bounds how stale another tab's view can be, so don't rely on it for timeouts of only a few seconds. Browsers without `BroadcastChannel` stay correct within their own tab.
- **`onIdle`/`onActive` fire on transitions only**, once each, not per event.
- **`isIdle` never starts `true`** — mount time counts as activity, which also keeps hydration stable.

## Related

- [usePolling](../usePolling/README.md) — pauses on a hidden tab; pair with `useIdle` to also pause on an inattentive one.
- [useTabLeader](../useTabLeader/README.md) — for work that should run in exactly one tab rather than in whichever tab is active.

## SSR

Server-renders `isIdle: false`; tracking starts after mount.

---

[← All hooks](../../README.md)

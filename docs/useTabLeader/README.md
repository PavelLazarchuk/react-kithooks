# useTabLeader

Elects exactly one tab as the leader for a key, across every tab and window open on the origin — so a websocket, a poller, or a sync job runs once per browser session instead of once per open tab.

```ts
import { useTabLeader } from 'react-kithooks/useTabLeader';
```

## The problem

Open the same app in five tabs and naive code opens five websockets, runs five polling loops, and fires five copies of any "sync now" job — each tab acting as if it's alone. The usual hand-rolled fix is a `localStorage` timestamp that tabs poll and race to write, which has two known failure modes: two tabs can both read "no leader" in the same tick and both declare themselves leader, and a crashed tab leaves a stale lock that every other tab has to sit out until a timeout expires.

This hook uses the **Web Locks API** where it's available: `navigator.locks.request()` queues one request per tab and grants them one at a time, so the browser itself is the arbiter — no polling, no race, and no stale-lock window, because closing or crashing a tab makes the browser release its lock immediately and promote the next tab in line. Where Web Locks isn't available, it falls back to exactly the `localStorage`-heartbeat approach above, with its bounded (not instant) failover.

## Usage

```tsx
function SyncEngine() {
    const { isLeader } = useTabLeader('sync-engine');

    useEffect(() => {
        if (!isLeader) return;

        const socket = new WebSocket('wss://api.example.com/sync');
        return () => socket.close();
    }, [isLeader]);

    return null;
}
```

React to the transition directly, e.g. to hand off in-memory state:

```tsx
useTabLeader('sync-engine', {
    onBecomeLeader: () => console.log('this tab now owns the socket'),
    onBecomeFollower: () => console.log('another tab took over'),
});
```

Mount it in as many components as you like — every `useTabLeader('sync-engine')` call in the same tab shares one election, so they never contend with each other.

## API

```ts
function useTabLeader(key: string, options?: UseTabLeaderOptions): UseTabLeaderReturn;
```

### Parameters

| Parameter | Type     | Description                                                                    |
| --------- | -------- | ------------------------------------------------------------------------------ |
| `key`     | `string` | Identifies what's being elected for. Different keys run independent elections. |

### Options

| Option             | Type         | Description                                          |
| ------------------ | ------------ | ---------------------------------------------------- |
| `onBecomeLeader`   | `() => void` | Called when this tab transitions to leader.          |
| `onBecomeFollower` | `() => void` | Called when this tab was leader and stops being one. |

### Returns

| Field       | Type                                  | Description                                                                                                                                                               |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isLeader`  | `boolean`                             | Whether this tab currently holds leadership.                                                                                                                              |
| `status`    | `'pending' \| 'leader' \| 'follower'` | `'pending'` until the election settles, then whichever role this tab was granted. A `'follower'` stays queued and is promoted to `'leader'` if the current one goes away. |
| `mechanism` | `'locks' \| 'storage' \| null`        | Which implementation is active — `null` until `status` leaves `'pending'`. Mainly useful for debugging.                                                                   |

## Notes

- **Failover speed depends on `mechanism`.** With `'locks'`, a leader's tab closing or crashing promotes the next tab immediately — the browser releases the lock as part of tearing down the page, no matter how it went away. With `'storage'`, a clean close (unmount, or `pagehide`) releases immediately too, but a hard crash (killed process, OS-level force quit) is only detected once the leader's heartbeat goes stale — up to a few seconds, not instant.
- **`'storage'` is the fallback**, used automatically when `navigator.locks` doesn't exist — older Safari (<15.4), Firefox (<96), or a non-browser environment. Both mechanisms expose the identical `isLeader`/`status` contract; only the failover bound differs.
- **Leadership doesn't change when a tab is backgrounded.** Unlike hooks that pause on `document.hidden`, a leader tab keeps its role while hidden — a background tab is usually exactly where you want the one shared websocket to keep running.
- **One election per tab per key**, no matter how many components call the hook — mounting it in ten components doesn't queue ten lock requests behind each other.
- Unmounting the last instance for a key releases leadership, letting another tab take over — it doesn't wait for the tab itself to close.

## SSR

Server-renders `{ isLeader: false, status: 'pending', mechanism: null }`; the election starts only after mount.

---

[← All hooks](../../README.md)

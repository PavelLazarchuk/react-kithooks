---
'react-kithooks': patch
---

fix(useTabLeader): a same-tick unmount and remount of the last consumer no longer surrenders leadership

The election's `stop()` — which actually releases the Web Lock, or removes the `localStorage` heartbeat claim — ran synchronously the instant the last `useTabLeader(key)` consumer in a tab unmounted. A parent re-keying the owning component, or two sibling components trading places, unmounts and remounts within the same commit; that tore the running election down and rejoined the queue from scratch, letting a competing tab pick up leadership in the gap even though the tab never really went away. Releasing the election is now deferred by a microtask and skipped if a new subscriber shows up before it runs, the same pattern already used to avoid evicting a still-used cache entry.

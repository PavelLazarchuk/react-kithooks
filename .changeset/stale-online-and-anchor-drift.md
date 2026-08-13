---
'react-kithooks': patch
---

Fix two stale-state bugs that only show up after the first mount.

**`useOnlineStatus` (and `usePolling` with `pauseWhenOffline`) reported a stale network state after a remount.** The shared store outlives its subscribers, but its `online`/`offline` listeners are attached only while something is subscribed. So a connection that dropped while nothing was mounted was never observed, and the next mount kept reporting the old value until the browser happened to fire another event — a poller could stay parked as "offline" after the network came back, or hammer a dead network believing it was up. The store now re-reads `navigator.onLine` when it re-attaches.

**`useScrollAnchor` could stop honoring user scrolls, leaving the view pinned to the anchor.** Scrolls the hook performs itself were tracked with a counter that assumed one scroll event per `scrollTop` assignment. Browsers coalesce several assignments made in the same frame into a single event — which `handleMutations` and a resize can easily produce — so the counter drifted upward, and each surplus count swallowed a real user scroll. A swallowed scroll never released the post-prepend settle window, so the next content resize yanked the reader back to the anchor. Programmatic scrolls are now recognised by the position they land on rather than by counting events, which is exact under coalescing and self-correcting when an assignment can't reach its target.

---
'react-kithooks': patch
---

`useSingleFlight`: add `cancel()` to the controls, so a call that never settles can no longer wedge the hook. It releases the lock and clears `pending` immediately; the abandoned promise still settles for whoever awaited it, but no longer touches `pending` or the lock a newer call has taken, and in `share` mode it stops being handed to new callers.

Repo checks: a meta test now fails the build when a hook is missing its barrel export, docs page, README link, size-limit budgets or SSR smoke coverage; coverage thresholds now measure hook `index.ts` files instead of excluding them, raised to the level the suite actually reaches; CI runs the suite a second time against React 18 and the oldest supported `react-hook-form`.

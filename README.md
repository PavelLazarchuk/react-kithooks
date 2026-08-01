# react-kithooks

[![npm version](https://img.shields.io/npm/v/react-kithooks.svg)](https://www.npmjs.com/package/react-kithooks)
[![npm downloads](https://img.shields.io/npm/dm/react-kithooks.svg)](https://www.npmjs.com/package/react-kithooks)

Production-grade React hooks for the hard 10% of browser UI — scroll anchoring, permissions, layered keyboard shortcuts, crash-safe form drafts, multi-tab-synced storage, real (not just `navigator.onLine`) connectivity, race-free async — plus the small utilities every app rewrites (debounce, media queries, render bookkeeping) with their known failure modes fixed.

Each hook exists because the naive version has a known failure mode — viewport jumps when chat history loads, permission prompts that can't be re-asked, every modal closing on one Escape, form drafts destroyed by JSON serialization, saves that land out of order.

- **TypeScript-first**, ESM + CJS, `sideEffects: false`
- **SSR-safe** (Next.js App Router) — every hook is import-safe and first-render-stable on the server
- **Zero runtime dependencies** (react-hook-form is an optional peer used only by one opt-in subpath)

```tsx
import { useScrollAnchor } from 'react-kithooks/useScrollAnchor';
import { useAsyncQueue } from 'react-kithooks/useAsyncQueue';

function Chat({ roomId }: { roomId: string }) {
    const [messages, setMessages] = useState<Message[]>([]);
    const { ref, isAtBottom, prepend, scrollToBottom } = useScrollAnchor();
    const { enqueue } = useAsyncQueue(`room:${roomId}`);

    const loadOlder = async () => {
        const older = await api.history(roomId, messages[0]?.id);

        // The reading position stays exactly where it was — no jump, and no
        // drift when images above finish decoding.
        prepend(() => setMessages(prev => [...older, ...prev]));
    };

    // Two fast edits reach the server in the order they were made, not in the
    // order the network happens to answer.
    const send = (text: string) => void enqueue(() => api.send(roomId, text));

    return (
        <>
            <div ref={ref} className="messages">
                <button onClick={loadOlder}>Load older</button>
                {messages.map(m => (
                    <Message key={m.id} {...m} />
                ))}
            </div>

            {/* New messages stick to the bottom only while the reader is
                already there; otherwise they queue up behind this button. */}
            {!isAtBottom && (
                <button onClick={() => scrollToBottom({ behavior: 'smooth' })}>
                    New messages ↓
                </button>
            )}
        </>
    );
}
```

## Install

```sh
npm install react-kithooks
```

Prefer per-hook subpath imports — guaranteed zero-overhead, no barrel in your bundle:

```ts
import { useScrollAnchor } from 'react-kithooks/useScrollAnchor';
```

Every hook is also re-exported from the package root for convenience:

```ts
import { useScrollAnchor, useLocalStorage } from 'react-kithooks';
```

## Hooks

### UI & interaction

| Hook                                                | What it fixes                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [useScrollAnchor](docs/useScrollAnchor/README.md)   | Viewport jump when prepending to a scrollable list, and stick-to-bottom that respects the reader. Element anchoring, so async content above doesn't break it. |
| [useKeyboardScope](docs/useKeyboardScope/README.md) | Layered shortcuts: the top-most scope suspends the ones below, and Escape only ever reaches one layer.                                                        |
| [useMediaQuery](docs/useMediaQuery/README.md)       | `matchMedia` that neither throws on the server nor mismatches on hydration.                                                                                   |

### Browser capabilities

| Hook                                              | What it fixes                                                                                                                                                   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [usePermission](docs/usePermission/README.md)     | One reactive status + `request()` across the fragmented permission APIs, with graceful fallbacks where the platform has none.                                   |
| [useOnlineStatus](docs/useOnlineStatus/README.md) | `navigator.onLine`'s false positive — an optional ping verifies there's actually internet, not just a network interface.                                        |
| [useTabLeader](docs/useTabLeader/README.md)       | Every open tab running its own websocket/poller. Elects one leader via the Web Locks API — instant failover, no stale-lock heartbeat race.                      |
| [useIdle](docs/useIdle/README.md)                 | Idle detection that survives a slept laptop and a throttled background tab — wall-clock verified, capture-phase, throttled instead of re-armed per `mousemove`. |

### Storage & persistence

| Hook                                                        | What it fixes                                                                                                                                                          |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [useLocalStorage](docs/useLocalStorage/README.md)           | `useState` backed by `localStorage`, synced across tabs **and** across instances in the current tab (`syncTabs: false` to opt out), with parse/quota failures handled. |
| [useSessionStorage](docs/useSessionStorage/README.md)       | Same API, tab-scoped lifetime — state that must not outlive the tab.                                                                                                   |
| [useIndexedDB](docs/useIndexedDB/README.md)                 | `useState` backed by IndexedDB for large or structured data, with on-demand stores and cross-tab sync over `BroadcastChannel`.                                         |
| [useFormCrashRecovery](docs/useFormCrashRecovery/README.md) | Form drafts that survive a crash: structured clone (Dates and Files intact), TTL, versioning, field exclusion, conflict handling. Never auto-restores.                 |

### Async

| Hook                                                        | What it fixes                                                                                                                                                                                      |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [useAbortableFetch](docs/useAbortableFetch/README.md)       | The stale-response race in `useEffect(() => { fetch(url).then(setData) }, [id])` — superseded responses are discarded even when abort is ignored.                                                  |
| [useAsyncQueue](docs/useAsyncQueue/README.md)               | Overlapping writes finishing out of order. A per-key mutex outside the React tree — or a bounded worker pool with priorities, pause/resume, and per-key replacement, when you raise `concurrency`. |
| [usePolling](docs/usePolling/README.md)                     | `setInterval` + `fetch`: overlapping ticks, a hidden tab polling all day, and a failing endpoint hammered at full rate.                                                                            |
| [useDebouncedValue](docs/useDebouncedValue/README.md)       | Debounce that also cancels when the value reverts within the window — type-and-undo produces no update — never starves, with `maxWaitMs`, and can hand back `isPending`/`flush`/`cancel`.          |
| [useDebouncedCallback](docs/useDebouncedCallback/README.md) | Stable identity, always calls the latest `fn`, with `flush`/`cancel`/`isPending` and a `maxWaitMs` ceiling.                                                                                        |

### Render bookkeeping

| Hook                                                | What it fixes                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------- |
| [useIsFirstRender](docs/useIsFirstRender/README.md) | First-render detection that doesn't diverge between StrictMode dev and prod. |
| [usePreviousValue](docs/usePreviousValue/README.md) | The previous **distinct** value — not "whatever it was at the last commit".  |

## SSR / Next.js

All hooks touch `window`/`document`/`navigator` only inside effects or callback refs. Server-render values:

| Hook                                    | Server value                                                             |
| --------------------------------------- | ------------------------------------------------------------------------ |
| `useScrollAnchor`                       | `isAtBottom: true`                                                       |
| `useKeyboardScope`                      | `isTopMost: false`                                                       |
| `useMediaQuery`                         | `serverFallback` (default `false`)                                       |
| `usePermission`                         | `status: 'loading'`                                                      |
| `useOnlineStatus`                       | `isOnline: true`                                                         |
| `useTabLeader`                          | `{ isLeader: false, status: 'pending', mechanism: null }`                |
| `useIdle`                               | `isIdle: false`                                                          |
| `useLocalStorage` / `useSessionStorage` | `initialValue`                                                           |
| `useIndexedDB`                          | `initialValue`, `status: 'loading'`                                      |
| `useFormCrashRecovery`                  | `{ recovered: null, status: 'idle' }`                                    |
| `useAbortableFetch`                     | `status: 'idle'`                                                         |
| `useAsyncQueue`                         | `{ status: 'idle', pending: 0, running: 0, queued: 0, isPaused: false }` |
| `usePolling`                            | `status: 'idle'`, `isPaused: false`                                      |
| `useDebouncedValue`                     | the current value                                                        |
| `useIsFirstRender`                      | `true`                                                                   |
| `usePreviousValue`                      | `undefined`                                                              |

No hydration mismatches.

Every build output carries the `'use client'` directive, so importing a hook from a Server Component marks the boundary instead of failing at runtime. You still choose where that boundary sits: importing into an existing `'use client'` file keeps it exactly where you put it.

## License

MIT

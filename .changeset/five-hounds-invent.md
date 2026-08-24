---
'react-kithooks': patch
---

fix(useDebouncedCallback): a changed `delayMs` now re-arms the call already waiting

The pending timer kept the delay it was armed with, so a `delayMs` (or `maxWaitMs`) that changed mid-wait only took effect from the _next_ call — a control that drops its debounce from 1000 ms to 100 ms still made the user wait out the second the old value asked for. The wait is now measured from when the call was made and re-armed when the delay changes, so shortening it past the time already served fires the pending invocation at once, and lengthening it holds the call for the new delay counted from that same call rather than from the moment of the change. `useDebouncedValue` already re-armed on a changed delay; the two now agree.

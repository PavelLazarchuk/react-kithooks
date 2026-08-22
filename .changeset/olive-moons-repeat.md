---
'react-kithooks': patch
---

fix(useFocusTrap): correct focus ownership and tabindex parsing

- A container React has already removed from the DOM no longer holds the trap. Cleanup runs a tick after the removal, and during that gap the stale trap both blocked the layer below from guarding focus and still reported `isActive: true`. The top-most trap is now the highest one whose container is still in the document.
- Changing `priority` on a live trap now re-orders it in place. It used to tear the trap down and rebuild it, which returned focus to the trigger and then re-ran initial focus — dragging the user back to the first field mid-dialog.
- A `tabindex` the browser cannot parse (`""`, `"auto"`, `"1.5"`) is now ignored, per HTML's rules for parsing integers, instead of being read as `0` or `-1`. `<div tabindex="">` is no longer treated as a tab stop, and `<button tabindex="auto">` is no longer skipped.

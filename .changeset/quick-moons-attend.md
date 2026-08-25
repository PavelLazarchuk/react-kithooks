---
'react-kithooks': patch
---

fix(useKeyboardScope): match own bindings only, and evict the combo cache by LRU

Bindings were enumerated with `for...in`, which walks the prototype chain: a bindings object built on a prototype — or a polluted `Object.prototype` — contributed shortcuts of its own, and any inherited value that is not a binding was handed to the matcher anyway. Only the object's own keys are read now.

The parsed-combo cache also emptied itself the moment it reached 500 entries, throwing away every shortcut in the app to make room for one. It now drops the single least recently used entry instead, so the shortcuts in active use stay parsed.

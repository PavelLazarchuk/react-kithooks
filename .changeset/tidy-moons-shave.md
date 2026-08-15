---
'react-kithooks': patch
---

Update the development toolchain: `eslint`, `typescript-eslint`, `prettier`, `publint`, `lint-staged`, `react`/`react-dom`, `react-hook-form` and the React types move to their latest in-range versions, and an `overrides` entry pins the `esbuild` used by `tsup` to `^0.28.2`, clearing GHSA-g7r4-m6w7-qqqr.

No shipped code changed — this is build and lint tooling only. Every bundle stays within its size budget and the package's export map still resolves cleanly under `publint` and `attw`.

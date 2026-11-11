---
'vitest-dynoxide': patch
---

Fix flaky `ECONNREFUSED` errors when test files run in parallel

Each test file chose a free port and released it before starting `dynoxide`, so another file could take the port in between.

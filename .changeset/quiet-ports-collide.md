---
'vitest-dynoxide': patch
---

setupFile: Fix flaky `ECONNREFUSED` errors when test files run in parallel

The per-file setup previously treated any listener on its chosen port as ready, so a file whose `dynoxide` failed to bind could silently share another file's instance and lose it when that file finished. Setup now waits for its own `dynoxide` process to report that it is listening, retries on a fresh port if the process exits first, and fails with the process output after 3 attempts.

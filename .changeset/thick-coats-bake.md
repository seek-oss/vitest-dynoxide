---
'vitest-dynoxide': major
---

Introducing vitest-dynoxide plugin to dynamically spawn a dynoxide instance for each integration test suite.

- Wait until the spawned dynoxide instance accepts TCP connections before loading tests, removing the need for consumer-side readiness polling.
- Expose the local endpoint as `AWS_ENDPOINT_URL_DYNAMODB` (IPv4 `127.0.0.1`) and set `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`, so `new DynamoDBClient()` works without per-client endpoint wiring.
- Reuse the gitignored `vitest-dynoxide.schemas.json` between local test runs. Delete it to refresh table schemas from AWS; clean CI checkouts generate it automatically.

**Breaking changes**

- Remove explicit `endpoint` options from DynamoDB clients in tests. An explicit `endpoint` overrides `AWS_ENDPOINT_URL_DYNAMODB`, so requests will not reach the dynoxide instance spawned for that file.
- Drop host/port environment variables used only to build local DynamoDB URLs (for example `TEST_TABLE_DYNAMODB_HOST` / `TEST_TABLE_DYNAMODB_PORT`). See the README migration guide.
- Update test snapshots where validation error messages differ from DynamoDB Local. Dynoxide matches live AWS more closely; see https://paritysuite.org/.

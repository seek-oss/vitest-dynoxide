# 🦕 vitest-dynoxide

[![Powered by skuba](https://img.shields.io/badge/🤿%20skuba-powered-009DC4)](https://github.com/seek-oss/skuba)

This package is intended to be public on [seek-oss].
To create an internal package,
run `skuba init` and select the `private-npm-package` template.

Next steps:

1. [ ] Read [SEEK's Open Source RFC].
2. [ ] Create a new repository in the [seek-oss] GitHub organisation.
3. [ ] Push local commits to the upstream GitHub branch.
4. [ ] Configure [GitHub repository settings].
5. [ ] Keep dependencies up to date with [Renovate];
       request installation in [#open-source].
6. [ ] Delete this checklist 😌.

[#open-source]: https://slack.com/app_redirect?channel=C39P1H2SU
[GitHub repository settings]: https://github.com/seek-oss/vitest-dynoxide/settings
[Renovate]: https://github.com/apps/renovate
[SEEK's Open Source RFC]: https://rfc.skinfra.xyz/RFC016-Open-Source.html

## Usage

`vitest-dynoxide` runs your integration tests against a local [dynoxide] instance
instead of real DynamoDB.
Each test file gets its own in-memory database on its own port,
so test files can't see each other's data.
No Docker, no JVM, no shared local DynamoDB to reset between runs.

### 1. Install

```shell
pnpm add --save-dev vitest-dynoxide
```

`@aws-sdk/client-dynamodb` and `vitest` are peer dependencies,
so you'll already have them in an integration test setup.
Make sure to install `dynoxide` as a dev dependency if the repo does not use it yet.

### 2. Describe your tables

Create a `vitest-dynoxide-config.ts` in your project root:

```typescript
import { defineConfig } from 'vitest-dynoxide';

export default defineConfig({
  tables: ['TestTable'],
});
```

Each entry is either a **table name**, a **full table ARN**, or a
**full definition**.

A table name or ARN acts as the source table identifier:
`DescribeTable` is called against the real table
and its key schema and indexes are copied into the local instance.
This needs AWS credentials and a table that exists,
but keeps the config to one line.

A bare table name targets the account associated with your AWS credentials.
To infer a table from another account, use its full ARN:

```typescript
export default defineConfig({
  tables: [
    'arn:aws:dynamodb:ap-southeast-2:007370059916:table/PostingPreferences',
  ],
});
```

The source table identifier is passed unchanged to `DescribeTable`.
The caller's identity policy and the table's resource policy must both allow
that operation. The local table uses the plain name returned by AWS, so
application code continues to access `PostingPreferences`.

A full definition is used as-is and makes no AWS calls,
so your tests run offline:

```typescript
import { defineConfig } from 'vitest-dynoxide';

export default defineConfig({
  tables: [
    'TestTable',
    {
      TableName: 'TestTableCatalogue',
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
    },
  ],
});
```

You can also supply _part_ of a definition.
Anything you leave out is filled in from the real table,
and anything you supply is never overwritten:

```typescript
{
  TableName: 'TestTableCatalogue',
  // Inferred: AttributeDefinitions, GlobalSecondaryIndexes, LocalSecondaryIndexes
  KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
}
```

> One rule to know:
> supplying **both** `AttributeDefinitions` and `KeySchema` marks a table as complete,
> and no `DescribeTable` call is made for it.
> Omitting `GlobalSecondaryIndexes` on such a table means "this table has no GSIs",
> not "go and infer them".

Keep the indexes if your code queries them.
A `Query` with an `IndexName` fails against a table scaffolded without that index,
even though it works fine against real DynamoDB.

### 3. Wire up Vitest

Specify the follow entry points in `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: true,
    globalSetup: ['vitest-dynoxide/globalSetup'],
    setupFiles: ['vitest-dynoxide/setupFile'],
  },
});
```

### 4. Construct your client

Construct the client normally:

```typescript
const client = new DynamoDBClient();
```

The setup file configures the AWS SDK through
`AWS_ENDPOINT_URL_DYNAMODB`, `AWS_REGION`, and local credentials.
It also exposes `DYNAMODB_ENDPOINT` for code that needs the URL directly.

Do not pass `endpoint` to the client in tests.
An explicit `endpoint` overrides `AWS_ENDPOINT_URL_DYNAMODB`,
so `vitest-dynoxide` cannot redirect your requests to its dynoxide instance.

#### Migrating from DynamoDB Local

If your clients read host and port from environment variables
and build an `endpoint` URL at module load time,
drop that wiring and let the SDK read `AWS_ENDPOINT_URL_DYNAMODB` instead.

Before in `framework/aws.ts`:

```typescript
import { Env } from 'skuba-dive';

import { config } from '#src/config.js';

const dbEndpoints = {
  testTable: {
    host: Env.string('TEST_TABLE_DYNAMODB_HOST', { default: 'localhost' }),
    port: Env.nonNegativeInteger('TEST_TABLE_DYNAMODB_PORT', {
      default: '8003',
    }),
  },
  // ...
};

const testTableOptions =
  config.dynamodbEnvironment === 'local'
    ? {
        region: 'local',
        endpoint: `http://${dbEndpoints.testTable.host}:${dbEndpoints.testTable.port}`,
      }
    : {};

const testTableClient = new DynamoDBClient(testTableOptions);
```

After:

```typescript
import { config } from '#src/config.js';

/**
 * During tests, `vitest-dynoxide` sets `AWS_ENDPOINT_URL_DYNAMODB` per file.
 * Do not pass `endpoint` here so the SDK uses that env var.
 */
const localOptions = {
  region: 'local',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
};

const testTableOptions =
  config.dynamodbEnvironment === 'local' ? localOptions : {};

const testTableClient = new DynamoDBClient(testTableOptions);
```

The setup file also sets `AWS_REGION` and local credentials,
so you can omit `localOptions` entirely and use `new DynamoDBClient()`.

Some test snapshots may need updating after switching.
Dynoxide returns validation errors that match live AWS more closely
than DynamoDB Local — for example,
`The number of conditions on the keys is invalid` may become
`The provided key element does not match the schema`.
That is expected: see the [DynamoDB conformance suite](https://paritysuite.org/)
for how dynoxide compares to DynamoDB Local and other emulators.

Then write tests as normal —
each file starts with empty tables:

```typescript
it('round-trips a test table', async () => {
  await client.send(
    new PutItemCommand({
      TableName: 'TestTable',
      Item: { pk: { S: 'primary-key-1' } },
    }),
  );

  const { Item } = await client.send(
    new GetItemCommand({
      TableName: 'TestTable',
      Key: { pk: { S: 'primary-key-1' } },
    }),
  );

  expect(Item).toEqual({ pk: { S: 'primary-key-1' } });
});
```

5. Add `/vitest-dynoxide.schemas.json` to `.gitignore`

Global setup writes `/vitest-dynoxide.schemas.json` to the project root
and reuses it between test runs.
Delete the file whenever you need to refresh your local schema from AWS.
Because the file is ignored, CI generates a fresh schema from AWS on each clean checkout.

### How it works

Global setup runs once per `vitest` invocation.
If `vitest-dynoxide.schemas.json` does not exist,
it loads your config,
fills in any missing table definitions via `DescribeTable`,
and writes the file to your project root.
If the file already exists, it is reused without making AWS calls.

The setup file then runs once per test file.
It picks a random port,
spawns `dynoxide --schema vitest-dynoxide.schemas.json` on it,
waits until the instance accepts connections,
and exposes its IPv4 endpoint through the AWS SDK environment variables,
and kills the process in `afterAll`.
Because the schema is scaffolded fresh into an in-memory database each time,
test files never share state.

### API

#### `defineConfig`

Types a `vitest-dynoxide-config.ts` default export.
It returns the config unchanged —
the value is only for editor completion and type checking.

```typescript
import { defineConfig } from 'vitest-dynoxide';
```

Exported types: `VitestDynoxideConfig`, `TableConfig`, `TableSchema`.

### Troubleshooting

**`could not find a config file in <dir>`** —
the config must sit in the directory `vitest` runs from,
which is your Vitest root rather than the location of your test files.

**`must default export a valid vitest-dynoxide config`** —
the message names the offending field.
Because an entry may be either a name or a definition,
both possibilities are reported;
read past the `expected string` half:

```text
✖ Invalid input: expected string, received object; KeySchema.0.KeyType: Invalid option: expected one of "HASH"|"RANGE"
  → at default.tables[0]
```

**Credential or `ResourceNotFoundException` errors during setup** —
a bare table name triggers a live `DescribeTable`.
Either authenticate against the account holding that table,
use a full table ARN with cross-account permissions,
or spell the definition out in full to run offline.

## Development

### Prerequisites

- Node.js 22+
- pnpm

```shell
pnpm install
```

### Test

```shell
pnpm test
```

### Lint

```shell
# Fix issues
pnpm format

# Check for issues
pnpm lint
```

### Package

```shell
# Compile source
pnpm build

# Review bundle
pnpm pack
```

## Release

This package is published to the public npm registry with a GitHub Actions [release workflow].
It depends on this repo being hosted on [seek-oss] with appropriate access;
follow the [OSS npm package guidance] to set up publishing.

Releases are managed with [changesets].
Run `pnpm changeset` to create a changeset file describing your change and its semver impact.
When merged to `main`, the release workflow will open a version bump PR.
Merging that PR publishes the new version to npm.

### Releasing snapshots

Snapshot releases let you publish a pre-release version from any branch without going through the full release process.
To publish a snapshot, manually trigger the [release workflow] on your branch via the GitHub Actions UI.
The snapshot will be published to npm under a unique version derived from the branch name.

[changesets]: https://github.com/changesets/changesets
[OSS npm package guidance]: https://github.com/SEEK-Jobs/seek-oss-ci/blob/master/NPM_PACKAGES.md#access-to-publish-to-npm
[release workflow]: .github/workflows/release.yml
[seek-oss]: https://github.com/seek-oss

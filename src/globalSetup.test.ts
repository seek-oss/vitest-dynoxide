import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import type { DescribeTableCommandOutput } from '@aws-sdk/client-dynamodb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSchemaFile,
  schemaFilePath,
  setup,
  teardown,
} from './globalSetup.js';

const send = vi.fn();

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(function () {
    return { send };
  }),
  DescribeTableCommand: vi.fn(function (input: unknown) {
    return { input };
  }),
}));

const describeTableResponse = (
  Table: DescribeTableCommandOutput['Table'],
): DescribeTableCommandOutput => ({ Table, $metadata: {} });

const readSchemaFile = async (cwd: string) =>
  JSON.parse(await fs.readFile(schemaFilePath(cwd), 'utf8')) as unknown;

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'vitest-dynoxide-'));
  send.mockReset();
});

afterEach(async () => {
  await fs.rm(cwd, { recursive: true, force: true });
});

describe('createSchemaFile', () => {
  it('writes a fully supplied table without describing it', async () => {
    const table = {
      TableName: 'ProductCatalogue',
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' as const },
      ],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' as const }],
    };

    await createSchemaFile([table], cwd);

    expect(send).not.toHaveBeenCalled();
    await expect(readSchemaFile(cwd)).resolves.toEqual([{ Table: table }]);
  });

  it('infers a bare table from DescribeTable', async () => {
    send.mockResolvedValue(
      describeTableResponse({
        TableName: 'PostingPreferences',
        AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
      }),
    );

    await createSchemaFile([{ TableName: 'PostingPreferences' }], cwd);

    expect(send).toHaveBeenCalledTimes(1);
    await expect(readSchemaFile(cwd)).resolves.toEqual([
      {
        Table: {
          TableName: 'PostingPreferences',
          AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
          KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
        },
      },
    ]);
  });

  it('keeps supplied fields when filling in the rest', async () => {
    send.mockResolvedValue(
      describeTableResponse({
        AttributeDefinitions: [
          { AttributeName: 'inferred', AttributeType: 'S' },
        ],
        KeySchema: [{ AttributeName: 'inferred', KeyType: 'HASH' }],
      }),
    );

    await createSchemaFile(
      [
        {
          TableName: 'PostingPreferences',
          KeySchema: [{ AttributeName: 'supplied', KeyType: 'HASH' }],
        },
      ],
      cwd,
    );

    await expect(readSchemaFile(cwd)).resolves.toEqual([
      {
        Table: {
          TableName: 'PostingPreferences',
          AttributeDefinitions: [
            { AttributeName: 'inferred', AttributeType: 'S' },
          ],
          KeySchema: [{ AttributeName: 'supplied', KeyType: 'HASH' }],
        },
      },
    ]);
  });

  it('strips runtime state from inferred indexes', async () => {
    send.mockResolvedValue(
      describeTableResponse({
        AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'gsi1',
            KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'ALL' },
            IndexStatus: 'ACTIVE',
            ItemCount: 42,
          },
        ],
        LocalSecondaryIndexes: [
          {
            IndexName: 'lsi1',
            KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
            Projection: { ProjectionType: 'KEYS_ONLY' },
            IndexArn: 'arn:aws:dynamodb:table/Foo/index/lsi1',
          },
        ],
      }),
    );

    await createSchemaFile([{ TableName: 'Foo' }], cwd);

    await expect(readSchemaFile(cwd)).resolves.toEqual([
      {
        Table: expect.objectContaining({
          GlobalSecondaryIndexes: [
            {
              IndexName: 'gsi1',
              KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
              Projection: { ProjectionType: 'ALL' },
            },
          ],
          LocalSecondaryIndexes: [
            {
              IndexName: 'lsi1',
              KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
              Projection: { ProjectionType: 'KEYS_ONLY' },
            },
          ],
        }),
      },
    ]);
  });

  it('drops indexes that DescribeTable returned incomplete', async () => {
    send.mockResolvedValue(
      describeTableResponse({
        AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
        GlobalSecondaryIndexes: [{ IndexName: 'gsi1' }],
      }),
    );

    await createSchemaFile([{ TableName: 'Foo' }], cwd);

    await expect(readSchemaFile(cwd)).resolves.toEqual([
      { Table: expect.objectContaining({ GlobalSecondaryIndexes: [] }) },
    ]);
  });

  it('omits index fields when the table has none', async () => {
    send.mockResolvedValue(describeTableResponse({}));

    await createSchemaFile([{ TableName: 'Foo' }], cwd);

    await expect(readSchemaFile(cwd)).resolves.toEqual([
      { Table: { TableName: 'Foo' } },
    ]);
  });
});

describe('setup', () => {
  it('writes a schema file from the config in the working directory', async () => {
    await fs.writeFile(
      path.join(cwd, 'vitest-dynoxide-config.ts'),
      `export default {
        tables: [
          {
            TableName: 'Foo',
            AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
            KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
          },
        ],
      };`,
      'utf8',
    );

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(cwd);

    try {
      await setup();

      await expect(readSchemaFile(cwd)).resolves.toEqual([
        { Table: expect.objectContaining({ TableName: 'Foo' }) },
      ]);

      await teardown();

      await expect(fs.access(schemaFilePath(cwd))).rejects.toThrow();
    } finally {
      cwdSpy.mockRestore();
    }
  });
});

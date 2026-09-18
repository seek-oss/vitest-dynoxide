import fs from 'node:fs/promises';

import {
  DescribeTableCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { describe, expect, it } from 'vitest';

import { schemaFilePath, setup } from 'vitest-dynoxide/globalSetup';

const client = new DynamoDBClient();

describe('vitest-dynoxide', () => {
  it('copies the source schema into an isolated Dynoxide instance', async () => {
    const { Table } = await client.send(
      new DescribeTableCommand({ TableName: 'TestTableCatalogue' }),
    );

    expect(Table?.StreamSpecification).toEqual({
      StreamEnabled: true,
      StreamViewType: 'NEW_AND_OLD_IMAGES',
    });

    await client.send(
      new PutItemCommand({
        TableName: 'TestTableCatalogue',
        Item: { pk: { S: 'product-1' } },
      }),
    );

    await expect(
      client.send(
        new GetItemCommand({
          TableName: 'TestTableCatalogue',
          Key: { pk: { S: 'product-1' } },
        }),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        Item: { pk: { S: 'product-1' } },
      }),
    );
  });

  it('keeps the generated schema file for reuse', async () => {
    await setup();

    await expect(fs.access(schemaFilePath())).resolves.toBeUndefined();
  });
});

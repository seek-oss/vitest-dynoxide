import fs from 'fs/promises';

import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { beforeEach } from 'vitest';
import * as z from 'zod';

import type { TableSchema } from './config.js';
import { schemaFilePath } from './globalSetup.js';

const schemaFileSchema: z.ZodType<Array<{ Table: TableSchema }>> = z.array(
  z.object({
    Table: z.looseObject({
      TableName: z.string(),
    }),
  }),
);

const loadTables = async () => {
  const schemaFile = await fs.readFile(schemaFilePath(), 'utf8');

  return schemaFileSchema.parse(JSON.parse(schemaFile));
};

const getTables = (() => {
  let tablesPromise: ReturnType<typeof loadTables> | undefined;

  return () => {
    tablesPromise ??= loadTables();

    return tablesPromise;
  };
})();

export const clearTables = async () => {
  const tables = await getTables();
  const dynamoClient = new DynamoDBClient({});

  await Promise.all(
    tables.map(async ({ Table }) =>
      dynamoClient.send(new DeleteTableCommand({ TableName: Table.TableName })),
    ),
  );

  await Promise.all(
    tables.map(async ({ Table }) =>
      dynamoClient.send(new CreateTableCommand(Table)),
    ),
  );
};

beforeEach(clearTables);

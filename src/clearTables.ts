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

export const clearTables = async () => {
  const schemaFile = await fs.readFile(schemaFilePath(), 'utf8');
  const tables = schemaFileSchema.parse(JSON.parse(schemaFile));
  const dynamoClient = new DynamoDBClient({});

  for (const { Table } of tables) {
    await dynamoClient.send(
      new DeleteTableCommand({ TableName: Table.TableName }),
    );
  }

  for (const { Table } of tables) {
    await dynamoClient.send(new CreateTableCommand(Table));
  }
};

beforeEach(clearTables);

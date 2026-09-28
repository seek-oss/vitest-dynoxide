import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { beforeEach, inject } from 'vitest';

import { TABLE_SCHEMAS_CONTEXT_KEY } from './config.js';

export const clearTables = async () => {
  const tables = inject(TABLE_SCHEMAS_CONTEXT_KEY);
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

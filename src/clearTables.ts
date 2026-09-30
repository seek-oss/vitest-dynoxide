import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import { beforeEach, inject } from 'vitest';

import { TABLE_SCHEMAS_CONTEXT_KEY } from './config.js';

const dynamoClient = new DynamoDBClient({});
const tables = inject(TABLE_SCHEMAS_CONTEXT_KEY);

export const clearTables = async () => {
  await Promise.all(
    tables.map(async ({ Table }) => {
      await dynamoClient.send(
        new DeleteTableCommand({ TableName: Table.TableName }),
      );
      await dynamoClient.send(new CreateTableCommand(Table));
    }),
  );
};

beforeEach(clearTables);

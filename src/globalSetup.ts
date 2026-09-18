import fs from 'fs/promises';
import path from 'path';

import {
  DescribeTableCommand,
  DynamoDBClient,
  type GlobalSecondaryIndexDescription,
  type LocalSecondaryIndexDescription,
} from '@aws-sdk/client-dynamodb';

import { type TableSchema, loadConfig } from './config.js';

export const schemaFilePath = (cwd: string = process.cwd()) =>
  path.resolve(cwd, 'vitest-dynoxide.schemas.json');

const toSecondaryIndexes = (
  indexes:
    | GlobalSecondaryIndexDescription[]
    | LocalSecondaryIndexDescription[]
    | undefined,
) =>
  indexes?.flatMap(({ IndexName, KeySchema, Projection }) =>
    IndexName && KeySchema && Projection
      ? [{ IndexName, KeySchema, Projection }]
      : [],
  );

const resolveTable = async (
  client: DynamoDBClient,
  table: TableSchema,
): Promise<TableSchema> => {
  if (table.AttributeDefinitions && table.KeySchema) {
    return table;
  }

  const sourceTableIdentifier = table.TableName;
  const { Table: describedTable } = await client.send(
    new DescribeTableCommand({ TableName: sourceTableIdentifier }),
  );

  return {
    TableName: describedTable?.TableName ?? sourceTableIdentifier,
    AttributeDefinitions:
      table.AttributeDefinitions ?? describedTable?.AttributeDefinitions,
    KeySchema: table.KeySchema ?? describedTable?.KeySchema,
    GlobalSecondaryIndexes:
      table.GlobalSecondaryIndexes ??
      toSecondaryIndexes(describedTable?.GlobalSecondaryIndexes),
    LocalSecondaryIndexes:
      table.LocalSecondaryIndexes ??
      toSecondaryIndexes(describedTable?.LocalSecondaryIndexes),
  };
};

export const createSchemaFile = async (tables: TableSchema[], cwd?: string) => {
  const client = new DynamoDBClient({});

  const schema = await Promise.all(
    tables.map(async (table) => ({
      Table: await resolveTable(client, table),
    })),
  );

  await fs.writeFile(schemaFilePath(cwd), JSON.stringify(schema, null, 2));
};

export const setup = async () => {
  const hasSchemaFile = await fs.access(schemaFilePath()).then(
    () => true,
    () => false,
  );

  if (hasSchemaFile) {
    return;
  }

  const { tables } = await loadConfig();

  await createSchemaFile(tables);
};

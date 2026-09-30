import fs from 'fs/promises';
import path from 'path';

import {
  DescribeTableCommand,
  DynamoDBClient,
  type GlobalSecondaryIndexDescription,
  type LocalSecondaryIndexDescription,
} from '@aws-sdk/client-dynamodb';
import * as z from 'zod';

import {
  type DynoxideSchema,
  TABLE_SCHEMAS_CONTEXT_KEY,
  type TableSchema,
  loadConfig,
} from './config.js';

export const schemaFilePath = (cwd: string = process.cwd()) =>
  path.resolve(cwd, 'vitest-dynoxide.schemas.json');

const schemaFileSchema: z.ZodType<DynoxideSchema> = z.array(
  z.object({
    Table: z.looseObject({
      TableName: z.string(),
    }),
  }),
);

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

  const schema: DynoxideSchema = await Promise.all(
    tables.map(async (table) => ({
      Table: await resolveTable(client, table),
    })),
  );

  await fs.writeFile(schemaFilePath(cwd), JSON.stringify(schema, null, 2));

  return schema;
};

import type { TestProject } from 'vitest/node'

export const setup = async (project: TestProject) => {
  const hasSchemaFile = await fs.access(schemaFilePath()).then(
    () => true,
    () => false,
  );

  const schema = hasSchemaFile
    ? schemaFileSchema.parse(
        JSON.parse(await fs.readFile(schemaFilePath(), 'utf8')),
      )
    : await loadConfig().then(({ tables }) => createSchemaFile(tables));

  project.provide(TABLE_SCHEMAS_CONTEXT_KEY, schema);
};

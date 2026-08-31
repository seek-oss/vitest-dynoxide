import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

import type { CreateTableInput } from '@aws-sdk/client-dynamodb';
import * as z from 'zod';

type SchemaFields = Pick<
  CreateTableInput,
  | 'AttributeDefinitions'
  | 'KeySchema'
  | 'GlobalSecondaryIndexes'
  | 'LocalSecondaryIndexes'
>;

export type TableSchema = SchemaFields & { TableName: string };

export type TableConfig = string | TableSchema;

export type VitestDynoxideConfig = {
  tables: TableConfig[];
};

export type ResolvedConfig = {
  tables: TableSchema[];
};

export const defineConfig = (config: VitestDynoxideConfig) => config;

const CONFIG_FILE_NAMES = [
  'vitest-dynoxide-config.ts',
  'vitest-dynoxide-config.mts',
  'vitest-dynoxide-config.js',
  'vitest-dynoxide-config.mjs',
];

const fileExists = (filePath: string) =>
  fs.access(filePath).then(
    () => true,
    () => false,
  );

const findConfigFile = async (cwd: string): Promise<string | undefined> => {
  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = path.resolve(cwd, fileName);

    if (await fileExists(filePath)) {
      return filePath;
    }
  }

  return undefined;
};

const keySchemaSchema = z
  .array(
    z.object({
      AttributeName: z.string(),
      KeyType: z.enum(['HASH', 'RANGE']),
    }),
  )
  .min(1);

const secondaryIndexSchema = z.object({
  IndexName: z.string(),
  KeySchema: keySchemaSchema,
  Projection: z.object({
    ProjectionType: z.enum(['ALL', 'KEYS_ONLY', 'INCLUDE']).optional(),
    NonKeyAttributes: z.array(z.string()).optional(),
  }),
});

const tableSchemaSchema = z.object({
  TableName: z.string(),
  AttributeDefinitions: z
    .array(
      z.object({
        AttributeName: z.string(),
        AttributeType: z.enum(['S', 'N', 'B']),
      }),
    )
    .optional(),
  KeySchema: keySchemaSchema.optional(),
  GlobalSecondaryIndexes: z.array(secondaryIndexSchema).optional(),
  LocalSecondaryIndexes: z.array(secondaryIndexSchema).optional(),
});

const tableNameSchema = z.string().transform((TableName) => ({ TableName }));

const describeIssue = (issue: z.core.$ZodIssue) =>
  issue.path.length
    ? `${issue.path.join('.')}: ${issue.message}`
    : issue.message;

const tableConfigSchema = z.union([tableNameSchema, tableSchemaSchema], {
  error: ({ errors }) => errors.flat().map(describeIssue).join('; '),
});

const configSchema: z.ZodType<ResolvedConfig> = z.object({
  tables: z.array(tableConfigSchema).min(1),
});

const moduleSchema = z.object({ default: configSchema });

export const loadConfig = async (
  cwd: string = process.cwd(),
): Promise<ResolvedConfig> => {
  const filePath = await findConfigFile(cwd);

  if (!filePath) {
    throw new Error(
      `vitest-dynoxide could not find a config file in ${cwd}. Create one of: ${CONFIG_FILE_NAMES.join(', ')}`,
    );
  }

  const module: unknown = await import(pathToFileURL(filePath).href);
  const result = moduleSchema.safeParse(module);

  if (!result.success) {
    throw new Error(
      `${filePath} must default export a valid vitest-dynoxide config:\n${z.prettifyError(result.error)}`,
    );
  }

  return result.data.default;
};

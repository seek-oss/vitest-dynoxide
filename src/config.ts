import fs from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

import type { CreateTableInput } from '@aws-sdk/client-dynamodb';
import * as z from 'zod';

export type TableSchema = Pick<CreateTableInput, 'TableName'> &
  Partial<
    Pick<
      CreateTableInput,
      | 'AttributeDefinitions'
      | 'KeySchema'
      | 'GlobalSecondaryIndexes'
      | 'LocalSecondaryIndexes'
      | 'StreamSpecification'
    >
  >;

export type TableConfig = string | TableSchema;

export type VitestDynoxideConfig = {
  tables: TableConfig[];
};

export type ResolvedConfig = {
  tables: TableSchema[];
};

export const defineConfig = (config: VitestDynoxideConfig) => config;

const fileExists = (filePath: string) =>
  fs.access(filePath).then(
    () => true,
    () => false,
  );

const findConfigFile = async (cwd: string): Promise<string | undefined> => {
  const filePath = path.resolve(cwd, 'vitest-dynoxide-config.ts');

  if (await fileExists(filePath)) {
    return filePath;
  }

  return undefined;
};

const tableSchemaSchema: z.ZodType<TableSchema> = z.looseObject({
  TableName: z.string(),
});

const tableNameSchema = z.string().transform((TableName) => ({ TableName }));
const tableConfigSchema = z.union([tableNameSchema, tableSchemaSchema]);

const configSchema: z.ZodType<ResolvedConfig> = z.object({
  tables: z.array(tableConfigSchema).min(1),
});

const moduleSchema = z.object({ default: configSchema });

export const loadConfig = async (
  cwd: string = process.cwd(),
): Promise<ResolvedConfig> => {
  let module: unknown;
  try {
    module = await import(pathToFileURL(filePath).href);
  } catch (error) {
    throw new Error(
      `vitest-dynoxide failed to load config file ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const result = moduleSchema.safeParse(module);

  if (!result.success) {
    throw new Error(
      `${filePath} must default export a valid vitest-dynoxide config:\n${z.prettifyError(result.error)}`,
    );
  }

  return result.data.default;
};

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { clearTables } from './clearTables.js';
import { schemaFilePath } from './globalSetup.js';

const send = vi.fn();
const readFileSpy = vi.spyOn(fs, 'readFile');

vi.mock('@aws-sdk/client-dynamodb', () => ({
  CreateTableCommand: vi.fn(function (input: unknown) {
    return { input, type: 'create' };
  }),
  DeleteTableCommand: vi.fn(function (input: unknown) {
    return { input, type: 'delete' };
  }),
  DynamoDBClient: vi.fn(function () {
    return { send };
  }),
}));

let cwd: string;
let cwdSpy: ReturnType<typeof vi.spyOn>;

const tables = [
  {
    Table: {
      TableName: 'TestTable',
      AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
    },
  },
];

beforeAll(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'vitest-dynoxide-'));
  await fs.writeFile(schemaFilePath(cwd), JSON.stringify(tables));
  cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(cwd);
});

afterAll(async () => {
  readFileSpy.mockRestore();
  cwdSpy.mockRestore();
  await fs.rm(cwd, { recursive: true, force: true });
});

describe('clearTables', () => {
  it('recreates configured tables before each test', async () => {
    expect(send.mock.calls).toEqual([
      [
        {
          input: { TableName: 'TestTable' },
          type: 'delete',
        },
      ],
      [
        {
          input: tables[0]?.Table,
          type: 'create',
        },
      ],
    ]);

    await clearTables();

    expect(readFileSpy).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(4);
  });
});

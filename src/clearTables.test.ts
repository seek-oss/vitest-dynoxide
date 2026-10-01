import { describe, expect, it, vi } from 'vitest';

import { clearTables } from './clearTables.js';

const send = vi.hoisted(() => vi.fn());

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

const tables = [
  {
    Table: {
      TableName: 'TestTable',
      AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
    },
  },
];

describe('clearTables', () => {
  it('recreates injected tables before each test', async () => {
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

    expect(send).toHaveBeenCalledTimes(4);
  });
});

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

const tempDirs: string[] = [];

const writeConfigFile = async (contents: string, fileName = 'config.ts') => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vitest-dynoxide-'));
  tempDirs.push(dir);

  await fs.writeFile(
    path.join(dir, `vitest-dynoxide-${fileName}`),
    contents,
    'utf8',
  );

  return dir;
};

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true })));
  tempDirs.length = 0;
});

describe('loadConfig', () => {
  it('widens a bare table name to a schema', async () => {
    const cwd = await writeConfigFile(
      `export default { tables: ['PostingPreferences'] };`,
    );

    await expect(loadConfig(cwd)).resolves.toEqual({
      tables: [{ TableName: 'PostingPreferences' }],
    });
  });

  it('loads a config of inline table definitions', async () => {
    const cwd = await writeConfigFile(`export default {
      tables: [
        {
          TableName: 'ProductCatalogue',
          AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
          KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
        },
      ],
    };`);

    const { tables } = await loadConfig(cwd);

    expect(tables).toEqual([
      expect.objectContaining({ TableName: 'ProductCatalogue' }),
    ]);
  });

  it('throws when no config file is present', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vitest-dynoxide-'));
    tempDirs.push(dir);

    await expect(loadConfig(dir)).rejects.toThrow('could not find a config');
  });

  it('throws when the config lists no tables', async () => {
    const cwd = await writeConfigFile(`export default { tables: [] };`);

    await expect(loadConfig(cwd)).rejects.toThrow(
      'must default export a valid vitest-dynoxide config',
    );
  });

  it('reports the offending field when a table is malformed', async () => {
    const cwd = await writeConfigFile(`export default {
      tables: [{ TableName: 'Foo', KeySchema: [{ AttributeName: 'pk' }] }],
    };`);

    await expect(loadConfig(cwd)).rejects.toThrow('KeyType');
  });
});

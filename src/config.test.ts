import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { afterEach, describe, expect, it, vi } from 'vitest';

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
  vi.restoreAllMocks();
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true })));
  tempDirs.length = 0;
});

describe('loadConfig', () => {
  it('widens a bare table name to a schema', async () => {
    const cwd = await writeConfigFile(
      `export default { tables: ['TestTable'] };`,
    );
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);

    await expect(loadConfig()).resolves.toEqual({
      tables: [{ TableName: 'TestTable' }],
    });
  });

  it('loads a config of inline table definitions', async () => {
    const cwd = await writeConfigFile(`export default {
      tables: [
        {
          TableName: 'TestTableCatalogue',
          AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
          KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
        },
      ],
    };`);
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);

    const { tables } = await loadConfig();

    expect(tables).toEqual([
      expect.objectContaining({ TableName: 'TestTableCatalogue' }),
    ]);
  });

  it('throws when no config file is present', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vitest-dynoxide-'));
    tempDirs.push(dir);
    vi.spyOn(process, 'cwd').mockReturnValue(dir);

    await expect(loadConfig()).rejects.toThrow(
      'vitest-dynoxide failed to load config file',
    );
  });

  it('includes non-Error config load failures', async () => {
    const cwd = await writeConfigFile(`throw 'broken config';`);
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);

    await expect(loadConfig()).rejects.toThrow(
      'vitest-dynoxide failed to load config file',
    );
    await expect(loadConfig()).rejects.toThrow('broken config');
  });

  it('throws when the config lists no tables', async () => {
    const cwd = await writeConfigFile(`export default { tables: [] };`);
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);

    await expect(loadConfig()).rejects.toThrow(
      'must default export a valid vitest-dynoxide config',
    );
  });

  it('throws when a table has no name', async () => {
    const cwd = await writeConfigFile(`export default {
      tables: [{ KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }] }],
    };`);
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);

    await expect(loadConfig()).rejects.toThrow(
      'must default export a valid vitest-dynoxide config',
    );
  });
});

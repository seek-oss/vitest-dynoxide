import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import './setupFile.js';

const { kill } = vi.hoisted(() => ({ kill: vi.fn() }));

vi.mock('node:child_process', async () => {
  const { EventEmitter } =
    await vi.importActual<typeof import('node:events')>('node:events');

  let spawnCount = 0;

  return {
    spawn: vi.fn((_command: string, args: string[]) => {
      spawnCount += 1;
      const isFirstSpawn = spawnCount === 1;
      const port = args[args.indexOf('--port') + 1];

      const stderr = Object.assign(new EventEmitter(), { resume: vi.fn() });
      const child = Object.assign(new EventEmitter(), { kill, stderr });

      queueMicrotask(() => {
        if (isFirstSpawn) {
          stderr.emit(
            'data',
            Buffer.from(`error: port ${port} is already in use\n`),
          );
          child.emit('exit', 1, null);
          return;
        }

        stderr.emit(
          'data',
          Buffer.from(`Dynoxide listening on http://127.0.0.1:${port}\n`),
        );
      });

      return child;
    }),
  };
});

const spawnCalls = vi.mocked(spawn).mock.calls;

const portOf = (args: readonly string[] | undefined) =>
  args?.[args.indexOf('--port') + 1];

describe('setupFile', () => {
  it('spawns dynoxide against the generated schema file', () => {
    const [command, args] = spawnCalls[0] ?? [];

    expect(command).toBe(
      fileURLToPath(import.meta.resolve('dynoxide/bin/dynoxide')),
    );
    expect(args).toEqual([
      '--schema',
      'vitest-dynoxide.schemas.json',
      '--port',
      expect.stringMatching(/^\d+$/),
    ]);
  });

  it('retries on a fresh port when dynoxide exits before listening', () => {
    expect(spawnCalls).toHaveLength(2);
  });

  it('configures the AWS SDK with the port dynoxide is listening on', () => {
    const port = portOf(spawnCalls[1]?.[1]);

    expect(process.env.DYNAMODB_ENDPOINT).toBe(`http://127.0.0.1:${port}`);
    expect(process.env.AWS_ENDPOINT_URL_DYNAMODB).toBe(
      `http://127.0.0.1:${port}`,
    );
  });
});

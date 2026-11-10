import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import './setupFile.js';

const { kill } = vi.hoisted(() => ({ kill: vi.fn() }));

vi.mock('node:child_process', async () => {
  const { EventEmitter } =
    await vi.importActual<typeof import('node:events')>('node:events');
  const { PassThrough } =
    await vi.importActual<typeof import('node:stream')>('node:stream');

  return {
    spawn: vi.fn(() => {
      const stderr = new PassThrough();
      const child = Object.assign(new EventEmitter(), { kill, stderr });

      queueMicrotask(() => {
        child.emit('spawn');
        stderr.write('Scaffolded 1 table(s) from schema\n');
        stderr.write('Dynoxide listening on http://127.0.0.1:54321\n');
      });

      return child;
    }),
  };
});

describe('setupFile', () => {
  it('spawns dynoxide on an OS-assigned port', () => {
    const [command, args] = vi.mocked(spawn).mock.calls[0] ?? [];

    expect(command).toBe(
      fileURLToPath(import.meta.resolve('dynoxide/bin/dynoxide')),
    );
    expect(args).toEqual([
      '--schema',
      'vitest-dynoxide.schemas.json',
      '--port',
      '0',
    ]);
  });

  it('configures the AWS SDK with the port dynoxide reports', () => {
    expect(process.env.DYNAMODB_ENDPOINT).toBe('http://127.0.0.1:54321');
    expect(process.env.AWS_ENDPOINT_URL_DYNAMODB).toBe(
      'http://127.0.0.1:54321',
    );
    expect(kill).not.toHaveBeenCalled();
  });
});

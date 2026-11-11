import type { EventEmitter } from 'node:events';
import type { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it, vi } from 'vitest';

type MockChild = EventEmitter & { stderr: PassThrough };

const { kill, onSpawn } = vi.hoisted(() => ({
  kill: vi.fn(),
  onSpawn: vi.fn<(child: MockChild) => void>(),
}));

vi.mock('node:child_process', async () => {
  const { EventEmitter } =
    await vi.importActual<typeof import('node:events')>('node:events');
  const { PassThrough } =
    await vi.importActual<typeof import('node:stream')>('node:stream');

  return {
    spawn: vi.fn(() => {
      const child = Object.assign(new EventEmitter(), {
        kill,
        stderr: new PassThrough(),
      });

      queueMicrotask(() => onSpawn(child));

      return child;
    }),
  };
});

const importSetupFile = () =>
  import('./setupFile.js').then(
    () => undefined,
    (error: unknown) => error,
  );

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  kill.mockReset();
  onSpawn.mockReset();
});

describe('setupFile', () => {
  it('fails when dynoxide cannot be spawned', async () => {
    onSpawn.mockImplementation((child) =>
      child.emit('error', new Error('spawn dynoxide ENOENT')),
    );

    await expect(importSetupFile()).resolves.toHaveProperty(
      'message',
      'spawn dynoxide ENOENT',
    );
    expect(kill).not.toHaveBeenCalled();
  });

  it('fails with the output of a dynoxide that exits before listening', async () => {
    onSpawn.mockImplementation((child) => {
      child.emit('spawn');
      child.stderr.end('error: port 54321 is already in use\n');
    });

    await expect(importSetupFile()).resolves.toHaveProperty(
      'message',
      'dynoxide exited before it was ready\nerror: port 54321 is already in use',
    );
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it('fails when dynoxide does not report a port in time', async () => {
    const timeout = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);

    onSpawn.mockImplementation((child) => {
      child.emit('spawn');
      child.stderr.write('Dynoxide listening on http://127.0.0.1:0\n');
      setTimeout(() => timeout.abort(), 0);
    });

    await expect(importSetupFile()).resolves.toHaveProperty(
      'message',
      'dynoxide did not start within 10000ms\nDynoxide listening on http://127.0.0.1:0',
    );
    expect(kill).toHaveBeenCalledTimes(1);
  });
});

import { spawn } from 'node:child_process';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { kill } = vi.hoisted(() => ({ kill: vi.fn() }));

vi.mock('node:child_process', async () => {
  const { EventEmitter } =
    await vi.importActual<typeof import('node:events')>('node:events');

  let spawnCount = 0;

  return {
    spawn: vi.fn(() => {
      spawnCount += 1;
      const isLastSpawn = spawnCount === 3;

      const stderr = Object.assign(new EventEmitter(), { resume: vi.fn() });
      const child = Object.assign(new EventEmitter(), { kill, stderr });

      if (spawnCount === 1) {
        queueMicrotask(() => child.emit('exit', null, 'SIGKILL'));
      } else if (!isLastSpawn) {
        queueMicrotask(() => child.emit('exit', 1, null));
      }

      return child;
    }),
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('setupFile', () => {
  it('gives up after repeated failures to start dynoxide', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const setupError = import('./setupFile.js').catch(
      (error: unknown) => error,
    );

    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(3));
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(setupError).resolves.toHaveProperty(
      'message',
      'dynoxide failed to start after 3 attempts, last did not start within 10000ms: ',
    );
    expect(kill).toHaveBeenCalledTimes(1);
  });
});

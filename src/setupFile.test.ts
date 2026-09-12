import { spawn } from 'node:child_process';

import { describe, expect, it, vi } from 'vitest';

import './setupFile.js';

const { connect, kill } = vi.hoisted(() => ({
  connect: vi.fn(),
  kill: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({ kill })),
}));

vi.mock('node:net', async () => {
  const { EventEmitter } =
    await vi.importActual<typeof import('node:events')>('node:events');

  return {
    default: {
      connect: connect.mockImplementation(() => {
        const socket = Object.assign(new EventEmitter(), {
          destroy: vi.fn(),
        });
        const event = connect.mock.calls.length === 1 ? 'error' : 'connect';

        queueMicrotask(() => socket.emit(event));

        return socket;
      }),
    },
  };
});

const [command, args] = vi.mocked(spawn).mock.calls[0] ?? [];

describe('setupFile', () => {
  it('spawns dynoxide against the generated schema file', () => {
    expect(command).toBe('dynoxide');
    expect(args).toEqual([
      '--schema',
      'vitest-dynoxide.schemas.json',
      '--port',
      expect.stringMatching(/^\d+$/),
    ]);
  });

  it('waits for dynoxide and configures the AWS SDK', () => {
    const port = args?.at(-1);
    const endpoint = `http://127.0.0.1:${port}`;

    expect(connect).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenLastCalledWith({
      host: '127.0.0.1',
      port: Number(port),
    });
    expect(process.env.DYNAMODB_ENDPOINT).toBe(endpoint);
  });
});

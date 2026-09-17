import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

import { afterAll, vi } from 'vitest';

const READY_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 25;

const canConnect = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });

    const settle = (isConnected: boolean) => {
      socket.destroy();
      resolve(isConnected);
    };

    socket.once('connect', () => settle(true));
    socket.once('error', () => settle(false));
  });

// Spawn a fresh in-memory `dynoxide` instance per integration test file (see
// `fileParallelism: false` in vitest.config.ts) instead of sharing one
// DynamoDB Local instance across the whole run. This keeps test files
// isolated without needing Docker.
const DYNAMODB_PORT = 10000 + Math.floor(Math.random() * 10000);
const DYNAMODB_ENDPOINT = `http://127.0.0.1:${DYNAMODB_PORT}`;
vi.stubEnv('AWS_REGION', 'local');
vi.stubEnv('AWS_ENDPOINT_URL_DYNAMODB', DYNAMODB_ENDPOINT);

const dynoxideBin = fileURLToPath(import.meta.resolve('dynoxide/bin/dynoxide'));

const dynoxide = spawn(
  dynoxideBin,
  ['--schema', 'vitest-dynoxide.schemas.json', '--port', String(DYNAMODB_PORT)],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);

await vi.waitUntil(() => canConnect(DYNAMODB_PORT), {
  interval: POLL_INTERVAL_MS,
  timeout: READY_TIMEOUT_MS,
});

afterAll(() => {
  dynoxide.kill();
});

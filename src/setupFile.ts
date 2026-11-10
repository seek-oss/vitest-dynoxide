import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { afterAll, vi } from 'vitest';

const READY_TIMEOUT_MS = 10_000;
const LISTENING_LINE = /^Dynoxide listening on http:\/\/127\.0\.0\.1:(\d+)$/;

const dynoxideBin = fileURLToPath(import.meta.resolve('dynoxide/bin/dynoxide'));

// `--port 0` has the OS assign a free port as dynoxide binds, so it is read
// back from this process's own startup line rather than chosen up front.
const waitForPort = async (stderr: Readable) => {
  const signal = AbortSignal.timeout(READY_TIMEOUT_MS);
  const output: string[] = [];

  for await (const line of createInterface({ input: stderr, signal })) {
    const port = Number(LISTENING_LINE.exec(line)?.[1]);
    if (port) {
      return port;
    }
    output.push(line);
  }

  const reason = signal.aborted
    ? `did not start within ${READY_TIMEOUT_MS}ms`
    : 'exited before it was ready';
  throw new Error(`dynoxide ${reason}\n${output.join('\n')}`);
};

// Spawn a fresh in-memory `dynoxide` instance per test file instead of sharing
// one DynamoDB Local instance across the whole run. This keeps test files
// isolated without needing Docker.
const dynoxide = spawn(
  dynoxideBin,
  ['--schema', 'vitest-dynoxide.schemas.json', '--port', '0'],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);

await once(dynoxide, 'spawn');

const port = await waitForPort(dynoxide.stderr).catch((error: unknown) => {
  dynoxide.kill();
  throw error;
});

dynoxide.stderr.resume();

const DYNAMODB_ENDPOINT = `http://127.0.0.1:${port}`;
vi.stubEnv('DYNAMODB_ENDPOINT', DYNAMODB_ENDPOINT);
vi.stubEnv('AWS_ENDPOINT_URL_DYNAMODB', DYNAMODB_ENDPOINT);
vi.stubEnv('AWS_REGION', 'local');
vi.stubEnv('AWS_ACCESS_KEY_ID', 'local');
vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'local');

afterAll(() => {
  dynoxide.kill();
});

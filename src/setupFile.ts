import { type ChildProcessByStdio, spawn } from 'node:child_process';
import net from 'node:net';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { afterAll, vi } from 'vitest';

const READY_TIMEOUT_MS = 10_000;
const MAX_START_ATTEMPTS = 3;
const LISTENING_MESSAGE = 'Dynoxide listening on ';

type DynoxideProcess = ChildProcessByStdio<null, null, Readable>;

const getAvailablePort = () => {
  using bound = new net.BoundSocket({ host: '127.0.0.1' });
  return bound.address().port;
};

const dynoxideBin = fileURLToPath(import.meta.resolve('dynoxide/bin/dynoxide'));

// Resolves once this process reports it is listening, so a port answered by
// another file's instance is never mistaken for our own. Resolves with an
// error message if the process exits or times out first.
const waitForListening = (dynoxide: DynoxideProcess) =>
  new Promise<string | undefined>((resolve) => {
    let output = '';

    const settle = (error?: string) => {
      clearTimeout(timeout);
      dynoxide.stderr.off('data', onData);
      dynoxide.off('exit', onExit);
      dynoxide.stderr.resume();
      resolve(error);
    };

    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes(LISTENING_MESSAGE)) {
        settle();
      }
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) =>
      settle(`exited with ${code ?? signal}: ${output.trim()}`);

    const timeout = setTimeout(() => {
      dynoxide.kill();
      settle(`did not start within ${READY_TIMEOUT_MS}ms: ${output.trim()}`);
    }, READY_TIMEOUT_MS);

    dynoxide.stderr.on('data', onData);
    dynoxide.once('exit', onExit);
  });

const startDynoxide = async (
  attempt = 1,
): Promise<{ dynoxide: DynoxideProcess; port: number }> => {
  const port = getAvailablePort();

  const dynoxide = spawn(
    dynoxideBin,
    ['--schema', 'vitest-dynoxide.schemas.json', '--port', String(port)],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  const error = await waitForListening(dynoxide);

  if (!error) {
    return { dynoxide, port };
  }

  if (attempt >= MAX_START_ATTEMPTS) {
    throw new Error(
      `dynoxide failed to start after ${attempt} attempts, last ${error}`,
    );
  }

  return startDynoxide(attempt + 1);
};

// Spawn a fresh in-memory `dynoxide` instance per test file instead of sharing
// one DynamoDB Local instance across the whole run. This keeps test files
// isolated without needing Docker.
const { dynoxide, port } = await startDynoxide();

const DYNAMODB_ENDPOINT = `http://127.0.0.1:${port}`;
vi.stubEnv('DYNAMODB_ENDPOINT', DYNAMODB_ENDPOINT);
vi.stubEnv('AWS_ENDPOINT_URL_DYNAMODB', DYNAMODB_ENDPOINT);
vi.stubEnv('AWS_REGION', 'local');
vi.stubEnv('AWS_ACCESS_KEY_ID', 'local');
vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'local');

afterAll(() => {
  dynoxide.kill();
});

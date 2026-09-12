import { type ChildProcess, spawn } from 'node:child_process';
import net from 'node:net';
import { setTimeout } from 'node:timers/promises';

import { CreateTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';

const READY_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 25;
const LOCAL_CREDENTIALS = {
  accessKeyId: 'local',
  secretAccessKey: 'local',
};

const state: { dynoxide?: ChildProcess } = {};

const getAvailablePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a Dynoxide port'));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(address.port);
        }
      });
    });
  });

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

const waitForConnection = async (port: number, deadline: number) => {
  if (await canConnect(port)) {
    return;
  }

  if (Date.now() >= deadline) {
    throw new Error(`Dynoxide did not start on port ${port}`);
  }

  await setTimeout(POLL_INTERVAL_MS);
  await waitForConnection(port, deadline);
};

export const setup = async () => {
  const port = await getAvailablePort();
  const endpoint = `http://127.0.0.1:${port}`;
  const dynoxide = spawn('dynoxide', ['--port', String(port)], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  state.dynoxide = dynoxide;

  try {
    await waitForConnection(port, Date.now() + READY_TIMEOUT_MS);

    const client = new DynamoDBClient({
      credentials: LOCAL_CREDENTIALS,
      endpoint,
      region: 'local',
    });

    await client.send(
      new CreateTableCommand({
        TableName: 'TestTableCatalogue',
        AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
        StreamSpecification: {
          StreamEnabled: true,
          StreamViewType: 'NEW_AND_OLD_IMAGES',
        },
      }),
    );
  } catch (error) {
    dynoxide.kill();
    throw error;
  }
};

export const teardown = () => {
  state.dynoxide?.kill();
};

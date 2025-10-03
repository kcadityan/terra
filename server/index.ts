import http from 'http';
import { createRequire } from 'node:module';
import { TerraRoom } from './rooms/TerraRoom';
import { DEFAULT_PORT } from '../engine/shared/protocol';
import { initServerContext } from './context';

const portEnv = process.env.PORT ?? process.env.TERRA_PORT;
const port = portEnv ? Number(portEnv) : DEFAULT_PORT;

if (Number.isNaN(port)) {
  throw new Error(`Invalid PORT/TERRA_PORT value: ${portEnv}`);
}

await initServerContext();

const httpServer = http.createServer();
const require = createRequire(import.meta.url);
const { Server: ColyseusServer } = require('colyseus') as typeof import('colyseus');
const { WebSocketTransport } = require('@colyseus/ws-transport') as typeof import('@colyseus/ws-transport');

const gameServer = new ColyseusServer({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('terra', TerraRoom);

httpServer.listen(port, () => {
  console.log(`[terra-server] listening on ws://localhost:${port}`);
});

process.on('SIGINT', () => {
  console.log('\n[terra-server] shutting down');
  httpServer.close(() => process.exit(0));
});

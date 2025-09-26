# terra

A multiplayer Phaser sandbox with a deterministic world and shared state managed over WebSockets.

## Prerequisites

- Node.js 18+ (includes npm). Earlier versions may not support the ESM + tsx toolchain used here.

## Setup

```bash
npm install
```

This pulls client dependencies (Phaser, Vite) as well as the TypeScript tooling and WebSocket server packages.

## Run (development)

```bash
npm run dev
```

What happens:
- `vite` serves the browser client on http://localhost:5173 (default).
- `tsx server/index.ts` launches the authoritative WebSocket server on ws://localhost:3030.

Open the Vite URL in any browser. Each additional tab or machine that can reach both ports will join the same shared world.

Quick sanity check for multiplayer:
- Open http://localhost:5173 in one tab and move your player around.
- Open a second tab (or another browser/machine) to the same URL; you should see the first player standing where you left them.
- Mine or place a block in one tab and watch the change appear a moment later in the other tab.

### Running components individually

- Client only: `npm run dev:client`
- Server only: `npm run dev:server`

This is useful if you want to proxy the client through another tool or deploy the server separately.


### Customising ports / endpoints

By default the WebSocket server listens on port 3030 and the client connects to `ws://localhost:3030`. Override these when the default port is busy or you are proxying the server:

```bash
PORT=4040 npm run dev:server         # launch server on a new port
```

For the browser client, point it at the same port when running Vite:

```bash
VITE_TERRA_PORT=4040 npm run dev:client
```

If you still want `npm run dev` to start both pieces together, provide both variables:

```bash
PORT=4040 VITE_TERRA_PORT=4040 npm run dev
```

You can also supply a full WebSocket endpoint if the server runs on another host or behind a proxy:

```bash
VITE_TERRA_WS_URL=ws://example.com:4040 npm run dev:client
```

The server additionally respects `TERRA_PORT` (alias for `PORT`) for cases where you do not want to reuse the conventional `PORT` environment name.

## Production build & deploy

1. Build the client bundle:
   ```bash
   npm run build
   ```
   The static assets land in `dist/`.

2. Serve the contents of `dist/` with any static file host (e.g. `npx serve dist`, Nginx, S3, etc.).

3. Start the multiplayer server alongside your static host:
   ```bash
   npm run dev:server
   ```
   (For production you can replace this with `npx tsx server/index.ts` or transpile/run it in whatever Node process manager you prefer.)

Ensure port 3030 is reachable wherever clients are connecting from; the browser automatically points to the same hostname it was served from.

## Troubleshooting

- If clients cannot connect, verify the WebSocket port (3030) is open and not blocked by a firewall.
- If you see `EADDRINUSE: address already in use`, stop the previous server (Ctrl+C in that terminal) or relaunch with a different port as described above.
- When deploying behind a proxy, configure WebSocket forwarding on `/` so traffic reaches the Node server.
- To change ports permanently in code, update `DEFAULT_PORT` in `src/shared/protocol.ts` (client default) and mirror the value in your deployment configuration.

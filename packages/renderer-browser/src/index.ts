import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { realpath } from 'node:fs/promises';
import { SetcastError, type ResolvedProject } from '@setcast/core';
import { bundlePlayer } from './bundle.ts';
import { mediaType, projectAsset, serveAsset } from './assets.ts';

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setcast Player</title><link rel="stylesheet" href="/player.css"></head><body><div id="player"></div><script type="module" src="/player.js"></script></body></html>`;

export interface PlayerOptions {
  projectDir: string;
  port?: number;
}
export interface PlayerServer {
  url: string;
  close: () => Promise<void>;
}

export async function play(
  project: ResolvedProject,
  options: PlayerOptions,
): Promise<PlayerServer> {
  const port = options.port ?? 3210;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new SetcastError(
      `Invalid player port: ${port}`,
      'Use an integer from 1 to 65535, or 0 for an available port.',
    );
  }
  const root = await realpath(options.projectDir);
  const files = await bundlePlayer();
  files.set('/', Buffer.from(html));
  files.set('/project.json', Buffer.from(JSON.stringify(project)));
  const server = createServer((request, response) => {
    void respond(root, files, request, response).catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      response
        .writeHead(missing ? 404 : 500)
        .end(missing ? 'Asset not found' : 'Cannot read project asset');
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  }).catch((cause: unknown) => {
    throw new SetcastError(
      `Cannot start the player on localhost:${port}`,
      'Choose another --port or allow localhost access, then retry.',
      { cause, exitCode: 1 },
    );
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Player did not bind a TCP port.');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

async function respond(
  root: string,
  files: Map<string, Buffer>,
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host ?? '')) {
    response.writeHead(403).end();
    return;
  }
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  let path: string;
  try {
    path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const file = files.get(path);
  if (file) {
    let type = mediaType(path);
    if (path === '/') type = 'text/html';
    if (path === '/project.json') type = 'application/json';
    response.writeHead(200, { 'Content-Type': type, 'Content-Length': file.length });
    response.end(request.method === 'HEAD' ? undefined : file);
    return;
  }
  if (path.startsWith('/assets/')) {
    const asset = await projectAsset(root, path.slice('/assets/'.length));
    if (asset) {
      await serveAsset(asset, request, response);
      return;
    }
  }
  response.writeHead(404).end();
}

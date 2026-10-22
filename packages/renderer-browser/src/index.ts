import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { realpath, readFile } from 'node:fs/promises';
import { SetcastError, type SceneProject } from '@setcast/core';
import { bundlePlayer } from './bundle.ts';
import { mediaType, projectAsset, serveAsset } from './assets.ts';
import { projectCatalog, type ThemeCatalog } from './catalog.ts';
import { saveRequest } from './save.ts';

export type { ThemeCatalog, ThemeChoice, ThemeListing } from './catalog.ts';

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setcast Player</title><link rel="stylesheet" href="/player.css"></head><body><div id="player"></div><script type="module" src="/player.js"></script></body></html>`;

export interface PlayerOptions {
  projectDir: string;
  port?: number;
  /** Themes the player offers besides the project's own. */
  themes?: ThemeCatalog;
  /** Internal export server: prebundled frame driver, with all writes disabled. */
  captureFiles?: Map<string, Buffer>;
}
export interface PlayerServer {
  url: string;
  close: () => Promise<void>;
}

export async function play(project: SceneProject, options: PlayerOptions): Promise<PlayerServer> {
  const port = options.port ?? 3210;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new SetcastError(
      `Invalid player port: ${port}`,
      'Use an integer from 1 to 65535, or 0 for an available port.',
    );
  }
  const root = await realpath(options.projectDir);
  const files = new Map(options.captureFiles ?? (await bundlePlayer()));
  files.set('/', Buffer.from(html));
  files.set(
    '/capture-worklet.js',
    await readFile(new URL('../entry/capture-worklet.js', import.meta.url)),
  );
  const site = {
    root,
    files,
    catalog: projectCatalog(project, options.themes),
    readOnly: Boolean(options.captureFiles),
  };
  const server = createServer((request, response) => {
    void respond(site, request, response).catch((error: unknown) => failResponse(response, error));
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

function failResponse(response: ServerResponse, error: unknown) {
  if (response.headersSent) {
    response.destroy(error instanceof Error ? error : undefined);
    return;
  }
  const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
  response
    .writeHead(missing ? 404 : 500)
    .end(missing ? 'Asset not found' : 'Cannot read project asset');
}

interface Site {
  root: string;
  files: Map<string, Buffer>;
  catalog: ReturnType<typeof projectCatalog>;
  readOnly: boolean;
}

async function respond(
  { root, files, catalog, readOnly }: Site,
  request: IncomingMessage,
  response: ServerResponse,
) {
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host ?? '')) {
    response.writeHead(403).end();
    return;
  }
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  let url: URL;
  let path: string;
  try {
    url = new URL(request.url ?? '/', 'http://localhost');
    path = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  if (
    request.method === 'POST' &&
    ['/save', '/art', '/journal/start', '/journal/append'].includes(path)
  ) {
    if (readOnly) {
      response.writeHead(405).end();
      return;
    }
    await saveRequest(root, catalog, request, response);
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  if (path === '/themes.json') {
    send(request, response, Buffer.from(JSON.stringify(catalog.listings)), 'application/json');
    return;
  }
  if (path === '/project.json') {
    await sendProject(catalog, url.searchParams.get('theme'), request, response);
    return;
  }
  await sendFile({ root, files }, path, request, response);
}

async function sendFile(
  { root, files }: Pick<Site, 'root' | 'files'>,
  path: string,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const file = files.get(path);
  if (file) {
    send(request, response, file, path === '/' ? 'text/html' : mediaType(path));
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

function send(request: IncomingMessage, response: ServerResponse, body: Buffer, type: string) {
  response.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length });
  response.end(request.method === 'HEAD' ? undefined : body);
}

/** Theme failures reach the player as `{ message, hint }`, which it shows next to the picker. */
async function sendProject(
  catalog: Site['catalog'],
  theme: string | null,
  request: IncomingMessage,
  response: ServerResponse,
) {
  let project: Buffer;
  try {
    project = await catalog.load(theme ?? catalog.theme);
  } catch (error) {
    const unknown = !catalog.listings.some((listing) => listing.name === theme);
    const message = error instanceof Error ? error.message : String(error);
    const hint = error instanceof SetcastError ? error.hint : undefined;
    response
      .writeHead(unknown ? 404 : 500, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ message, hint }));
    return;
  }
  send(request, response, project, 'application/json');
}

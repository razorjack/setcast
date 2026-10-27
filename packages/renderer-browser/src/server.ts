import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { realpath, readFile } from 'node:fs/promises';
import { errorMessage, SetcastError, type SceneProject } from '@setcast/core';
import { bundlePlayer } from './bundle.ts';
import { mediaType, projectAsset, serveAsset } from './assets.ts';
import { projectCatalog, type ProjectCatalog, type ThemeCatalog } from './catalog.ts';
import { savedScene, savedScenes } from './scenes.ts';
import type { PreviewRevision } from './preview/server.ts';
import { respondToWrite, WRITE_ROUTES } from './writes.ts';

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setcast Player</title><link rel="stylesheet" href="/player.css"></head><body><div id="player"></div><script type="module" src="/player.js"></script></body></html>`;

export interface PlayerOptions {
  projectDir: string;
  port?: number;
  /** Themes the player offers besides the project's own. */
  themes?: ThemeCatalog;
}

export interface CaptureServerOptions {
  projectDir: string;
  /** The prebundled page: the export frame driver, or the preview with its frame. */
  files: Map<string, Buffer>;
  port?: number;
  /** The preview server's current revision, which it updates in place. */
  preview?: PreviewRevision;
}

export interface PlayerServer {
  url: string;
  close: () => Promise<void>;
}

/** The interactive player, which can save scenes, artwork and session journals. */
export async function play(project: SceneProject, options: PlayerOptions): Promise<PlayerServer> {
  const port = options.port ?? 3210;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new SetcastError(
      `Invalid player port: ${port}`,
      'Use an integer from 1 to 65535, or 0 for an available port.',
    );
  }
  const site = await siteFor(project, options.projectDir, await bundlePlayer(), options.themes);
  return listen({ ...site, writable: true }, port);
}

/** A read-only server for a prebundled export or preview page. */
export async function serveCapture(
  project: SceneProject,
  options: CaptureServerOptions,
): Promise<PlayerServer> {
  const site = await siteFor(project, options.projectDir, options.files);
  return listen({ ...site, writable: false, preview: options.preview }, options.port ?? 0);
}

interface Site {
  root: string;
  files: Map<string, Buffer>;
  catalog: ProjectCatalog;
  writable: boolean;
  preview?: PreviewRevision;
}

async function siteFor(
  project: SceneProject,
  projectDir: string,
  bundle: Map<string, Buffer>,
  themes?: ThemeCatalog,
) {
  const files = new Map(bundle);
  files.set('/', Buffer.from(html));
  files.set(
    '/capture-worklet.js',
    await readFile(new URL('../entry/capture-worklet.js', import.meta.url)),
  );
  return { root: await realpath(projectDir), files, catalog: projectCatalog(project, themes) };
}

async function listen(site: Site, port: number): Promise<PlayerServer> {
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

async function respond(site: Site, request: IncomingMessage, response: ServerResponse) {
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host ?? '')) {
    response.writeHead(403).end();
    return;
  }
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const url = requestUrl(request);
  if (!url) {
    response.writeHead(400).end();
    return;
  }
  const path = decodeURIComponent(url.pathname);
  const write = WRITE_ROUTES[path];
  if (request.method === 'POST' && write && site.writable) {
    await respondToWrite(site, write, request, response);
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  const read = READ_ROUTES[path];
  if (read) await read(site, url, request, response);
  else await sendFile(site, path, request, response);
}

/** The request's URL, or null when its path is not valid percent-encoding. */
function requestUrl(request: IncomingMessage): URL | null {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    decodeURIComponent(url.pathname);
    return url;
  } catch {
    return null;
  }
}

type ReadRoute = (
  site: Site,
  url: URL,
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void> | void;

const READ_ROUTES: Record<string, ReadRoute> = {
  '/themes.json': (site, _url, request, response) =>
    sendJson(request, response, site.catalog.listings),
  '/project.json': (site, url, request, response) => {
    if (site.preview) return sendJson(request, response, site.preview.project);
    return sendProject(site.catalog, url.searchParams.get('theme'), request, response);
  },
  '/preview.json': (site, url, request, response) => {
    if (!site.preview) return sendFile(site, url.pathname, request, response);
    return sendJson(request, response, previewRevision(site.preview, url));
  },
  '/scenes.json': (site, _url, request, response) =>
    sendScenes(() => savedScenes(site.root), request, response),
  '/scene.json': (site, url, request, response) =>
    sendScenes(
      () => savedScene(site.root, url.searchParams.get('preset') ?? ''),
      request,
      response,
    ),
};

/** The project only when the preview has a newer revision than the one the page asked about. */
function previewRevision(preview: PreviewRevision, url: URL) {
  const current = url.searchParams.get('revision') === String(preview.revision);
  return {
    revision: preview.revision,
    error: preview.error,
    project: current ? undefined : preview.project,
  };
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

function sendJson(request: IncomingMessage, response: ServerResponse, body: unknown) {
  send(request, response, Buffer.from(JSON.stringify(body)), 'application/json');
}

/** Theme failures reach the player as `{ message, hint }`, which it shows next to the picker. */
async function sendProject(
  catalog: ProjectCatalog,
  theme: string | null,
  request: IncomingMessage,
  response: ServerResponse,
) {
  let project: Buffer;
  try {
    project = await catalog.load(theme ?? catalog.theme);
  } catch (error) {
    const unknown = !catalog.listings.some((listing) => listing.name === theme);
    const hint = error instanceof SetcastError ? error.hint : undefined;
    response
      .writeHead(unknown ? 404 : 500, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ message: errorMessage(error), hint }));
    return;
  }
  send(request, response, project, 'application/json');
}

async function sendScenes(
  read: () => Promise<unknown>,
  request: IncomingMessage,
  response: ServerResponse,
) {
  try {
    sendJson(request, response, await read());
  } catch (error) {
    response
      .writeHead(400, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ message: errorMessage(error) }));
  }
}

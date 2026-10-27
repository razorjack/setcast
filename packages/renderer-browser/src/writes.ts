import { mkdtemp, open, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, join } from 'node:path';
import {
  errorMessage,
  VIDEO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  fileExtension,
  SceneSelectionSchema,
  type SceneProject,
} from '@setcast/core';
import { saveScene } from '@setcast/core/node';
import type { ProjectCatalog } from './catalog.ts';
import { savedScene } from './scenes.ts';
import { startJournal, appendJournal } from './journal.ts';

export interface WriteSite {
  root: string;
  catalog: ProjectCatalog;
}

type WriteRoute = (site: WriteSite, request: IncomingMessage, url: URL) => Promise<object>;

/** The player's write requests by path; each returns what it wrote as JSON. */
export const WRITE_ROUTES: Record<string, WriteRoute> = {
  '/art': (site, request, url) =>
    uploadArtwork(site.root, request, url.searchParams.get('name') ?? ''),
  '/journal/start': async (site, request) => startJournal(site.root, await readJsonBody(request)),
  '/journal/append': async (site, request) => appendJournal(site.root, await readJsonBody(request)),
  '/save': (site, request) => saveSelectedScene(site, request, 'scene'),
  '/journal/scene': (site, request) => saveSelectedScene(site, request, 'journal'),
};

/** Custom header and exact origin prevent unrelated sites from writing through localhost. */
export async function respondToWrite(
  site: WriteSite,
  route: WriteRoute,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const origin = `http://${request.headers.host}`;
  if (request.headers.origin !== origin || request.headers['x-setcast-player'] !== '1') {
    response.writeHead(403).end('Open the player on this localhost address to save.');
    return;
  }
  try {
    const written = await route(site, request, new URL(request.url!, origin));
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(written));
  } catch (error) {
    response
      .writeHead(400, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ message: errorMessage(error) }));
  }
}

async function saveSelectedScene(
  { root, catalog }: WriteSite,
  request: IncomingMessage,
  kind: 'scene' | 'journal',
) {
  const selected = SceneSelectionSchema.parse(await readJsonBody(request));
  const project: SceneProject = selected.preset
    ? await savedScene(root, selected.preset)
    : JSON.parse((await catalog.load(selected.theme)).toString());
  return saveScene(root, project, selected, kind);
}

const JSON_BODY_LIMIT = 32 * 1024;

/** The request's JSON object body, read up to `JSON_BODY_LIMIT` bytes. */
async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > JSON_BODY_LIMIT)
      throw new Error('The request exceeds 32 KiB. Shorten long text such as the title and retry.');
    chunks.push(chunk);
  }
  const body: unknown = JSON.parse(Buffer.concat(chunks).toString());
  if (body === null || typeof body !== 'object' || Array.isArray(body))
    throw new Error('The request body must be a JSON object.');
  return body as Record<string, unknown>;
}

async function uploadArtwork(root: string, request: IncomingMessage, name: string) {
  const extension = fileExtension(name);
  if (!IMAGE_EXTENSIONS.includes(extension) && !VIDEO_EXTENSIONS.includes(extension)) {
    const accepted = [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS].join(', ');
    throw new Error(`Cannot save artwork ${name}. Choose a file ending in ${accepted}.`);
  }
  const directory = await mkdtemp(join(root, 'player-art-'));
  const file = await open(join(directory, `art${extension}`), 'wx');
  try {
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 128 * 1024 * 1024) throw new Error('Artwork exceeds 128 MiB. Use a smaller file.');
      await file.writeFile(chunk);
    }
    if (size === 0) throw new Error('Artwork is empty. Choose a valid image or video.');
    return { path: `${basename(directory)}/art${extension}` };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  } finally {
    await file.close();
  }
}

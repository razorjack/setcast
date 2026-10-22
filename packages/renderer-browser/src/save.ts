import { mkdtemp, open, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, extname, join } from 'node:path';
import { SceneSelectionSchema, type SceneProject } from '@setcast/core';
import { saveScene } from '@setcast/core/node';
import type { projectCatalog } from './catalog.ts';
import { savedScene } from './scenes.ts';
import { startJournal, appendJournal } from './journal.ts';

/** Custom header and exact origin prevent unrelated sites from writing through localhost. */
export async function saveRequest(
  root: string,
  catalog: ReturnType<typeof projectCatalog>,
  request: IncomingMessage,
  response: ServerResponse,
) {
  const origin = `http://${request.headers.host}`;
  if (request.headers.origin !== origin || request.headers['x-setcast-player'] !== '1') {
    response.writeHead(403).end('Open the player on this localhost address to save.');
    return;
  }
  try {
    const url = new URL(request.url!, origin);
    let saved: object;
    if (url.pathname === '/art') {
      saved = await uploadArtwork(root, request, url.searchParams.get('name') ?? '');
    } else if (url.pathname === '/journal/start') {
      saved = await startJournal(root, await readSettings(request));
    } else if (url.pathname === '/journal/append') {
      saved = await appendJournal(root, await readSettings(request));
    } else {
      const selected = SceneSelectionSchema.parse(await readSettings(request));
      const project: SceneProject = selected.preset
        ? await savedScene(root, selected.preset)
        : JSON.parse((await catalog.load(selected.theme)).toString());
      saved = await saveScene(
        root,
        project,
        selected,
        url.pathname === '/journal/scene' ? 'journal' : 'scene',
      );
    }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(saved));
  } catch (error) {
    response
      .writeHead(400, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ message: error instanceof Error ? error.message : String(error) }));
  }
}

async function readSettings(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_768)
      throw new Error('Scene settings exceed 32 KiB. Shorten the title and retry.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

async function uploadArtwork(root: string, request: IncomingMessage, name: string) {
  const extension = extname(name).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.svg', '.mp4', '.webm', '.mov'].includes(extension)) {
    throw new Error(`Cannot save artwork ${name}. Choose PNG, JPEG, WebP, SVG, MP4, WebM or MOV.`);
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

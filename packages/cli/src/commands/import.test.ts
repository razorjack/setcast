import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { readTracklist, requireTracks } from './import.ts';

test('a tracklist read error other than ENOENT keeps its filesystem diagnosis', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'setcast-import-'));
  const tracklist = join(dir, 'tracks');
  try {
    await mkdir(tracklist);

    await expect(readTracklist(tracklist)).rejects.toMatchObject({ code: 'EISDIR' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('an empty forced-format import cannot replace the tracklist', () => {
  expect(() => requireTracks([], 'notes.txt')).toThrow('No tracks found in notes.txt');
});

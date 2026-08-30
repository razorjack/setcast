import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { readTracklist } from './import.ts';

test('a tracklist read error other than ENOENT keeps its filesystem diagnosis', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'setcast-import-'));
  const tracklist = join(dir, 'tracks');
  await mkdir(tracklist);

  await expect(readTracklist(tracklist)).rejects.toMatchObject({ code: 'EISDIR' });
});

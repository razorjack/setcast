import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeMix, type ResolvedProject } from '@setcast/core';
import { expect, test, vi } from 'vite-plus/test';

vi.mock('./bundle.ts', () => ({
  bundlePlayer: async () => new Map([['/player.js', Buffer.from('fixture')]]),
}));
const { play } = await import('./index.ts');
const project: ResolvedProject = {
  title: 'Server fixture',
  audio: 'set.mp3',
  background: null,
  backgroundFit: 'auto',
  theme: 'test',
  css: '',
  width: 640,
  height: 360,
  fps: 30,
  mix: normalizeMix({}, 10),
  presentation: 'playlist',
  visualizers: [],
  modulation: [],
  envelope: null,
  travel: null,
  panel: null,
  tracklist: null,
  bpm: null,
  beatOffset: 0,
  clockOffset: 0,
  clockTotal: null,
};

test('player serves project, bundles and seekable assets, then releases its port', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setcast-player-server-'));
  await writeFile(join(root, 'set.mp3'), '0123456789');
  const server = await play(project, { projectDir: root, port: 0 });
  try {
    expect(await (await fetch(server.url + '/project.json')).json()).toEqual(project);
    expect(await (await fetch(server.url)).text()).toContain('/player.js');
    const script = await fetch(server.url + '/player.js');
    expect(script.headers.get('content-type')).toBe('text/javascript');
    const ranged = await fetch(server.url + '/assets/set.mp3', { headers: { Range: 'bytes=2-5' } });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(await ranged.text()).toBe('2345');
    const head = await fetch(server.url + '/assets/set.mp3', { method: 'HEAD' });
    expect(head.headers.get('content-length')).toBe('10');
    expect(await head.text()).toBe('');
    expect(
      (await fetch(server.url + '/assets/set.mp3', { headers: { Range: 'bytes=11-' } })).status,
    ).toBe(416);
    expect((await fetch(server.url + '/assets/missing')).status).toBe(404);
    expect((await fetch(server.url + '/assets/%ZZ')).status).toBe(400);
    expect((await fetch(server.url, { method: 'POST' })).status).toBe(405);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
  await expect(fetch(server.url)).rejects.toThrow();
});

test('invalid ports fail before bundling or opening files', async () => {
  await expect(play(project, { projectDir: '/missing', port: -1 })).rejects.toMatchObject({
    message: 'Invalid player port: -1',
    hint: expect.stringContaining('1 to 65535'),
  });
});

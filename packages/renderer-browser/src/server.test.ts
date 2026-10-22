import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeMix, SetcastError, type ResolvedProject } from '@setcast/core';
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
    const worklet = await fetch(server.url + '/capture-worklet.js');
    expect(worklet.headers.get('content-type')).toBe('text/javascript');
    expect(await worklet.text()).toContain("registerProcessor('setcast-capture'");
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

test('player resolves each offered theme once, lists the project theme first and reports failures', async () => {
  const load = vi.fn(async (theme: string) => {
    if (theme === 'broken') throw new SetcastError('Theme CSS is missing', 'Reinstall the theme.');
    return { ...project, theme };
  });
  const choices = [{ name: 'pirate', description: 'Paper' }, { name: 'broken' }, { name: 'test' }];
  const server = await play(project, { projectDir: '.', port: 0, themes: { choices, load } });
  try {
    expect(await (await fetch(server.url + '/themes.json')).json()).toEqual([
      { name: 'test', project: true },
      { name: 'pirate', description: 'Paper', project: false },
      { name: 'broken', project: false },
    ]);
    for (let request = 0; request < 2; request++) {
      const themed = await fetch(server.url + '/project.json?theme=pirate');
      expect(await themed.json()).toMatchObject({ theme: 'pirate' });
    }
    expect(load).toHaveBeenCalledTimes(1);
    expect(await (await fetch(server.url + '/project.json?theme=test')).json()).toEqual(project);

    const unknown = await fetch(server.url + '/project.json?theme=nope');
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({
      message: 'Unknown theme "nope"',
      hint: 'Choose one of: test, pirate, broken.',
    });
    const broken = await fetch(server.url + '/project.json?theme=broken');
    expect(broken.status).toBe(500);
    expect(await broken.json()).toEqual({
      message: 'Theme CSS is missing',
      hint: 'Reinstall the theme.',
    });
    await fetch(server.url + '/project.json?theme=broken');
    expect(load).toHaveBeenCalledTimes(3);
  } finally {
    await server.close();
  }
});

test('invalid ports fail before bundling or opening files', async () => {
  await expect(play(project, { projectDir: '/missing', port: -1 })).rejects.toMatchObject({
    message: 'Invalid player port: -1',
    hint: expect.stringContaining('1 to 65535'),
  });
});

test('scene writes require an exact origin and header, validate paths, and leave source config intact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setcast-player-save-'));
  const yaml = 'audio: set.mp3\ntheme: ./test.css\n';
  await writeFile(join(root, 'setcast.yaml'), yaml);
  await writeFile(join(root, 'set.mp3'), 'audio');
  const server = await play(project, { projectDir: root, port: 0 });
  const body = JSON.stringify({ theme: 'test', art: 'none' });
  const headers = { Origin: server.url, 'X-Setcast-Player': '1' };
  try {
    const invalidHeaders: Record<string, string>[] = [
      {},
      { Origin: 'http://evil.example', 'X-Setcast-Player': '1' },
      { Origin: server.url },
    ];
    for (const invalid of invalidHeaders)
      expect(
        (await fetch(server.url + '/save', { method: 'POST', headers: invalid, body })).status,
      ).toBe(403);
    const saved = await fetch(server.url + '/save', { method: 'POST', headers, body });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({
      directory: expect.stringMatching(/^saved-scene-/),
      config: 'setcast.yaml',
    });
    const escaped = await fetch(server.url + '/save', {
      method: 'POST',
      headers,
      body: JSON.stringify({ theme: 'test', art: 'file', artwork: '../outside.png' }),
    });
    expect(escaped.status).toBe(400);
    const invalidType = await fetch(server.url + '/art?name=code.html', {
      method: 'POST',
      headers,
      body: 'html',
    });
    expect(invalidType.status).toBe(400);
    expect(await (await fetch(server.url + '/assets/setcast.yaml')).text()).toBe(yaml);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('export asset servers reject all player writes', async () => {
  const server = await play(project, { projectDir: '.', port: 0, captureFiles: new Map() });
  try {
    const response = await fetch(server.url + '/journal/start', {
      method: 'POST',
      headers: { Origin: server.url, 'X-Setcast-Player': '1' },
      body: '{}',
    });
    expect(response.status).toBe(405);
  } finally {
    await server.close();
  }
});

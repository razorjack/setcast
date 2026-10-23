import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { loadLiveProject } from './live.ts';
import { loadProject } from './project.ts';
import { saveScene } from './save-scene.ts';

test('saved recorded scene preserves timeline and copies selected media and resolved appearance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setcast-save-'));
  const yaml =
    'audio: mix.wav\ntheme: ./own.css\nplays: [{at: 0, title: Track, background: art.png}]\n';
  try {
    await writeFile(join(root, 'setcast.yaml'), yaml);
    await writeFile(join(root, 'own.css'), '.theme-own { color: red; }');
    await writeFile(join(root, 'mix.wav'), 'audio');
    await writeFile(join(root, 'art.png'), 'art');
    const options = { probeDuration: async () => 10 };
    const { project } = await loadProject(root, options);
    const saved = await saveScene(root, project, {
      theme: 'own',
      credits: 'tracklist',
      art: 'none',
    });
    const loaded = await loadProject(join(root, saved.directory), options);
    expect(loaded.project.mix.listings).toEqual(project.mix.listings);
    expect(loaded.project.mix.plays[0]!.background).toBeUndefined();
    expect(loaded.project.panel).toBeNull();
    expect(loaded.project.tracklist).not.toBeNull();
    expect(loaded.project.css).toContain('.theme-own { color: red; }');
    expect(await readFile(join(root, saved.directory, loaded.project.audio), 'utf8')).toBe('audio');
    expect(await readFile(join(root, 'setcast.yaml'), 'utf8')).toBe(yaml);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('live saves preserve tempo/input and reject escaped assets without leaving a partial copy', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setcast-save-'));
  const outside = await mkdtemp(join(tmpdir(), 'setcast-outside-'));
  try {
    await writeFile(
      join(root, 'live.yaml'),
      'theme: ./own.css\nbpm: 174\nprojection: { enabled: true }\ntestPattern: {pattern: motion, speed: 0.2}\nbeatTracking: {range: {min: 160, max: 185}}\n',
    );
    await writeFile(join(root, 'own.css'), '');
    await writeFile(join(outside, 'art.png'), 'private');
    await symlink(join(outside, 'art.png'), join(root, 'escape.png'));
    const { project } = await loadLiveProject(root);
    const selection = {
      theme: 'own',
      art: 'project' as const,
      title: 'Saved',
      bpm: null,
      input: { channels: [1, 1] as [number, number], gain: 2, delay: 0.5 },
    };
    const saved = await saveScene(root, project, selection);
    const loaded = await loadLiveProject(join(root, saved.directory));
    expect(project.live.projection?.enabled).toBe(true);
    expect(loaded.project.live.projection).toBeUndefined();
    expect(project.live.testPattern?.pattern).toBe('motion');
    expect(loaded.project.live.testPattern).toBeUndefined();
    expect(project.live.beatTracking?.range).toEqual({ min: 160, max: 185 });
    expect(loaded.project.live.beatTracking).toBeUndefined();
    expect(loaded.project.bpm).toBeNull();
    expect(loaded.project.live.input).toEqual(selection.input);
    const before = (await readdir(root)).sort();
    await expect(
      saveScene(root, project, { ...selection, art: 'file', artwork: 'escape.png' }),
    ).rejects.toThrow('outside the project');
    expect((await readdir(root)).sort()).toEqual(before);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

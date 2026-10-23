import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vite-plus/test';
import type { Theme } from '../theme.ts';
import { loadLiveProject } from './live.ts';

let dir: string;
let themes: Record<string, Theme>;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'setcast-live-'));
  const cssFile = join(dir, 'theme.css');
  await writeFile(cssFile, '.setcast { color: white; }');
  themes = { 'sterile-tech': { name: 'sterile-tech', cssFile, modulation: [] } };
});
afterAll(() => rm(dir, { recursive: true, force: true }));

test('loads defaults without a configuration, audio file or duration probe', async () => {
  const { project, warnings } = await loadLiveProject(dir, { themes });
  expect(project).toMatchObject({
    mix: null,
    audio: null,
    panel: null,
    tracklist: null,
    live: { clock: false, input: { channels: null, gain: 1, delay: 0 } },
  });
  expect(project.css).toContain('color: white');
  expect(warnings).toEqual([]);
});

test('resolves live settings and omits whole-set visualizers with a warning', async () => {
  await writeFile(
    join(dir, 'live.yaml'),
    `
title: Vinyl room
input: {device: Interface, channels: [3, 4], gain: 2, delay: 0.1}
visualizer: [{name: spectrum}, {name: overview}]
clock: true
output: {width: 1280, height: 720, fps: 60}
`,
  );
  const { project, warnings } = await loadLiveProject(dir, { themes });
  expect(project.live).toEqual({
    clock: true,
    input: { device: 'Interface', channels: [3, 4], gain: 2, delay: 0.1 },
  });
  expect(project.width).toBe(1280);
  expect(project.visualizers.map(({ name }) => name)).toEqual(['spectrum']);
  expect(warnings).toEqual([expect.stringContaining('Whole-set visualizers are omitted')]);
});

test('configuration errors name live.yaml and the invalid field', async () => {
  for (const [yaml, path, message] of [
    ['input: {channels: [0, 2]}', 'input.channels[0]', 'Input channels start at 1'],
    ['input: {delay: -1}', 'input.delay', 'cannot be negative'],
    ['visualizer: {name: unknown}', 'visualizer.name', 'Unknown visualizer'],
    ['testPattern: {detailSize: 0}', 'testPattern.detailSize', 'at least 1 composition pixel'],
  ]) {
    await writeFile(join(dir, 'live.yaml'), yaml!);
    await expect(loadLiveProject(dir, { themes })).rejects.toMatchObject({
      file: 'live.yaml',
      issues: [{ path, message: expect.stringContaining(message!) }],
    });
  }
});

test('live assets retain project path containment', async () => {
  await writeFile(join(dir, 'live.yaml'), 'background: ../outside.png');
  await expect(loadLiveProject(dir, { themes })).rejects.toMatchObject({
    message: 'background path leaves the project directory: ../outside.png',
    hint: expect.stringContaining('Use a path inside'),
  });
  await expect(loadLiveProject(join(dir, 'missing'), { themes })).rejects.toMatchObject({
    message: expect.stringContaining('Live project directory does not exist'),
    hint: expect.stringContaining('Choose an existing directory'),
  });
});

test('missing sequence scenes fail before starting the player', async () => {
  await writeFile(join(dir, 'live.yaml'), 'sequence: {scenes: [{preset: saved-scene-missing}]}');
  await expect(loadLiveProject(dir, { themes })).rejects.toMatchObject({
    message: expect.stringContaining('sequence.scenes[0].preset'),
    hint: expect.stringContaining('live.yaml'),
  });
});

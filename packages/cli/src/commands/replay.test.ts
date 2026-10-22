import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { loadLiveProject, loadProject, saveScene } from '@setcast/core/node';
import { Timeline, silentAnalyzer } from '@setcast/core';
import { resolveFrame } from '@setcast/core/react';

async function fixture(root: string) {
  await copyFile(
    new URL('../../../core/src/node/fixtures/probe-tone.mp3', import.meta.url),
    join(root, 'master.mp3'),
  );
  await writeFile(
    join(root, 'live.yaml'),
    'theme: ./own.css\nbpm: 120\nbeatOffset: 0.25\noutput: {width: 640, height: 360, fps: 30}\n',
  );
  await writeFile(join(root, 'own.css'), '.theme-own { color: red; }');
  const { project } = await loadLiveProject(root);
  return saveScene(root, project, { theme: 'own', art: 'none', title: 'Journal scene' });
}

function convert(root: string, events: object[]) {
  const header = {
    type: 'session',
    version: 1,
    sampleRate: 48000,
    originSample: 24000,
    startedAt: '2026-10-22T10:00:00Z',
    captureId: 'test',
  };
  return writeFile(
    join(root, 'session.jsonl'),
    [header, ...events].map((entry) => JSON.stringify(entry)).join('\n'),
  ).then(() => {
    execFileSync(
      process.execPath,
      [
        'packages/cli/bin/setcast.js',
        'replay',
        join(root, 'session.jsonl'),
        '--audio',
        join(root, 'master.mp3'),
        '--offset=-0.1',
      ],
      { stdio: 'pipe' },
    );
  });
}

test('journal CLI creates a standalone finite project with mapped credits, cues, scenes and beat phase', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setcast-replay-'));
  try {
    const saved = await fixture(root);
    await convert(root, [
      { type: 'scene', sample: 0, preset: saved.directory },
      { type: 'credit', sample: 0, title: 'Current' },
      { type: 'cue', sample: 12000, kind: 'drop' },
      { type: 'end', sample: 48000 },
    ]);
    const directory = (await readdir(root)).find((name) => name.startsWith('replay-'))!;
    const { project } = await loadProject(join(root, directory), {
      probeDuration: async () => 1.272,
    });
    expect([project.width, project.height, project.fps]).toEqual([640, 360, 30]);
    expect(project.mix.annotations[0]?.at).toBe(150000);
    expect(project.mix.listings[0]?.at).toBe(0);
    const frame = resolveFrame({
      project,
      timeline: new Timeline(project.mix),
      frame: 6,
      analyzer: silentAnalyzer,
    });
    expect(frame.composition.project.title).toBe('Journal scene');
    expect(frame.composition.project.beatOffset).toBeCloseTo(1.65);
    const copy = await saveScene(join(root, directory), project, { theme: 'initial', art: 'none' });
    await rm(join(root, saved.directory), { recursive: true });
    await expect(
      loadProject(join(root, directory, copy.directory), { probeDuration: async () => 1.272 }),
    ).resolves.toMatchObject({ project: { scenes: [{ at: 0 }] } });
    expect(await readFile(join(root, 'live.yaml'), 'utf8')).toContain('beatOffset: 0.25');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('replay rejects root scene copies and removes the partial project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setcast-replay-'));
  try {
    await fixture(root);
    await expect(convert(root, [{ type: 'scene', sample: 0, preset: '.' }])).rejects.toThrow();
    expect((await readdir(root)).some((name) => name.startsWith('replay-'))).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from 'vite-plus/test';
import { withCheckpoint, checkpointPath, parseManifest } from './checkpoint.ts';
import { canonical, digest, projectAssets } from './identity.ts';
import type { ResolvedProject } from '@setcast/core';

test('checkpoints survive failure, exclude concurrent writers, validate bytes and clear after success', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setcast-checkpoint-'));
  const out = join(root, 'out.mp4');
  const source = join(root, 'source');
  const copied = join(root, 'copied');
  const identity = { key: digest('job') };
  try {
    await writeFile(source, 'complete chunk');
    await expect(
      withCheckpoint(out, identity, async (checkpoint) => {
        await checkpoint.save(0, [0, 29], source);
        await expect(withCheckpoint(out, identity, async () => {})).rejects.toThrow('locked');
        throw new Error('interrupted');
      }),
    ).rejects.toThrow('interrupted');
    const directory = checkpointPath(out);
    await expect(readFile(join(directory, 'lock.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await withCheckpoint(out, identity, async (checkpoint) => {
      expect(await checkpoint.reuse(0, [0, 29], copied)).toBe(true);
      expect(await readFile(copied, 'utf8')).toBe('complete chunk');
      expect(await checkpoint.reuse(0, [1, 30], copied)).toBe(false);
      await writeFile(join(directory, 'chunk-0.mp4'), 'corrupt! chunk');
      expect(await checkpoint.reuse(0, [0, 29], copied)).toBe(false);
      await rm(join(directory, 'chunk-0.mp4'));
      expect(await checkpoint.reuse(0, [0, 29], copied)).toBe(false);
    });
    await expect(readFile(join(directory, 'manifest.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('changed identity ignores old chunks, and symbolic checkpoint directories are rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setcast-checkpoint-'));
  const out = join(root, 'out.mp4');
  const source = join(root, 'source');
  try {
    await writeFile(source, 'chunk');
    await expect(
      withCheckpoint(out, { key: digest('old') }, async (checkpoint) => {
        await checkpoint.save(0, [0, 29], source);
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    await withCheckpoint(out, { key: digest('changed') }, async (checkpoint) => {
      expect(await checkpoint.reuse(0, [0, 29], join(root, 'copied'))).toBe(false);
    });
    await symlink(root, checkpointPath(out));
    await expect(withCheckpoint(out, { key: digest('old') }, async () => {})).rejects.toThrow(
      'regular directory',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('manifest validation and dependency collection reject untracked input', () => {
  expect(canonical({ b: 2, a: { z: 3, x: 1 } })).toBe(canonical({ a: { x: 1, z: 3 }, b: 2 }));
  expect(() => parseManifest('{')).toThrow();
  expect(() =>
    parseManifest(JSON.stringify({ version: 1, key: digest('job'), chunks: { '../escape': {} } })),
  ).toThrow('chunk');
  const project = {
    audio: 'master.wav',
    background: 'cover.png',
    css: 'a { filter: url(#local); }',
    mix: { plays: [{ background: 'track.jpg' }] },
    scenes: [{ at: 1, scene: { background: 'saved/movie.mp4', css: '' } }],
  } as ResolvedProject;
  expect(projectAssets(project)).toEqual([
    'cover.png',
    'master.wav',
    'saved/movie.mp4',
    'track.jpg',
  ]);
  expect(() =>
    projectAssets({ ...project, css: 'a { background: url(https://example.com/a.png); }' }),
  ).toThrow('self-contained');
  expect(() => projectAssets({ ...project, css: '@import "remote.css";' })).toThrow(
    'self-contained',
  );
});

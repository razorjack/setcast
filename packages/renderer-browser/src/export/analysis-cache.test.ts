import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import {
  drawsWholeSet,
  readsTravel,
  resolveVisualizerConfigs,
  type ResolvedProject,
} from '@setcast/core';
import { readWholeSet } from '@setcast/core/node';
import { prepareProject } from './analysis-cache.ts';
import { clearRenderCache, inspectRenderCache } from './cache.ts';
import { digest, sourceTreeDigest } from './identity.ts';

vi.mock('@setcast/core/node', async (original) => ({
  ...(await original<typeof import('@setcast/core/node')>()),
  readWholeSet: vi.fn(),
}));
vi.mock('./identity.ts', async (original) => ({
  ...(await original<typeof import('./identity.ts')>()),
  sourceTreeDigest: vi.fn(),
}));
vi.mock('./probe.ts', () => ({
  encoderVersion: async () => ({ ffmpeg: 'test', ffprobe: 'test' }),
}));

const summary = { step: 0.25, bass: [0, 0.5, 1], high: [1, 0.5, 0] };
const decode = vi.mocked(readWholeSet);
let root: string;
let cache: { directory: string; maxBytes: number };
function project(overrides: Partial<ResolvedProject> = {}): ResolvedProject {
  return {
    audio: 'audio.wav',
    css: 'a { transform: translateX(var(--travel-bass)); }',
    visualizers: resolveVisualizerConfigs({ name: 'overview' }),
    envelope: null,
    travel: null,
    ...overrides,
  } as ResolvedProject;
}
const read = (input = project()) => prepareProject(input, { projectDir: root, cache });
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'setcast-analysis-cache-test-'));
  cache = { directory: join(root, 'cache'), maxBytes: 1024 * 1024 };
  await writeFile(join(root, 'audio.wav'), 'original audio');
  vi.mocked(sourceTreeDigest).mockReset().mockResolvedValue('core-v1');
  decode.mockReset().mockImplementation(async (input) => ({
    ...input,
    envelope: drawsWholeSet(input) ? structuredClone(summary) : null,
    travel: readsTravel(input) ? structuredClone(summary) : null,
  }));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test('independent preparations reuse content across appearance edits and own their arrays', async () => {
  const first = await read();
  first.envelope!.bass[1] = 99;
  const second = await read(
    project({ title: 'Edited title', css: 'b { color: red; left: var(--travel-bass); }' }),
  );
  expect(decode).toHaveBeenCalledTimes(1);
  expect(second.envelope).toEqual(summary);
  expect(second.travel).toEqual(summary);
  const report = await inspectRenderCache(cache.directory);
  expect(report.entries).toHaveLength(1);
  expect(report.entries[0]!.kind).toBe('analysis');
  await clearRenderCache(cache.directory);
  expect((await inspectRenderCache(cache.directory)).bytes).toBe(0);
  await read();
  expect(decode).toHaveBeenCalledTimes(2);
});

test('audio content, producer code and requested summaries invalidate preparation independently', async () => {
  await read();
  await writeFile(join(root, 'audio.wav'), 'modified audio');
  await read();
  vi.mocked(sourceTreeDigest).mockResolvedValue('core-v2');
  await read();
  const travel = await read(project({ visualizers: [] }));
  expect(travel.envelope).toBeNull();
  expect(travel.travel).toEqual(summary);
  expect(decode).toHaveBeenCalledTimes(4);
});

test('corrupt checksums and invalid but checksummed summaries are recomputed', async () => {
  await read();
  const entry = (await inspectRenderCache(cache.directory)).entries[0]!;
  const file = join(cache.directory, `entry-${entry.key}.json`);
  await writeFile(file, 'corrupt');
  await read();
  expect(decode).toHaveBeenCalledTimes(2);
  const invalid = JSON.stringify({
    version: 1,
    envelope: { ...summary, step: -1 },
    travel: summary,
  });
  await writeFile(file, invalid);
  const indexPath = join(cache.directory, 'index.json');
  const index = JSON.parse(await readFile(indexPath, 'utf8'));
  index.entries[entry.key].bytes = Buffer.byteLength(invalid);
  index.entries[entry.key].sha256 = digest(invalid);
  await writeFile(indexPath, JSON.stringify(index));
  expect((await read()).envelope).toEqual(summary);
  expect(decode).toHaveBeenCalledTimes(3);
});

test('changed sources and failed preparation release the lock without publishing summaries', async () => {
  decode.mockImplementationOnce(async (input) => {
    await writeFile(join(root, 'audio.wav'), 'changed during decode');
    return { ...input, envelope: summary, travel: summary };
  });
  await expect(read()).rejects.toThrow('Audio changed while preparing');
  expect((await inspectRenderCache(cache.directory)).entries).toEqual([]);
  decode.mockRejectedValueOnce(new Error('decoder failed'));
  await expect(read()).rejects.toThrow('decoder failed');
  await expect(readFile(join(cache.directory, 'lock.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  await read();
  expect((await inspectRenderCache(cache.directory)).entries).toHaveLength(1);
});

test('oversized summaries are not stored and unused analysis does not access audio or cache', async () => {
  cache.maxBytes = 1;
  await read();
  await read();
  expect(decode).toHaveBeenCalledTimes(2);
  expect((await inspectRenderCache(cache.directory)).entries).toEqual([]);
  const input = project({ audio: 'absent.wav', visualizers: [], css: '' });
  expect(await read(input)).toBe(input);
  expect(decode).toHaveBeenCalledTimes(2);
});

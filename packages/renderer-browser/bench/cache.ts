import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createFixture, fixtureProject } from '../../../scripts/export-acceptance/fixture.ts';
import {
  clearRenderCache,
  inspectRenderCache,
  render,
  type BrowserRenderOptions,
} from '../src/export/index.ts';
import type { ResolvedProject } from '@setcast/core';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) throw new Error('Pass --out NEW_DIRECTORY for cache validation artifacts.');
const root = resolve(values.out);
await mkdir(root);
const fixture = join(root, 'fixture');
await mkdir(fixture);
await createFixture(fixture);
const project = await fixtureProject(fixture, 'sterile-tech');
const options: BrowserRenderOptions = {
  projectDir: fixture,
  out: join(root, 'output.mp4'),
  range: [0, 2.5],
  chunkSeconds: 1,
  concurrency: 1,
  cache: { directory: join(root, 'cache'), maxBytes: 32 * 1024 * 1024 },
};
const results: Record<string, { captured: number; reused: number; workers: number | null }> = {};
const sentinel = 'previous output';

async function measured(
  name: string,
  scene: ResolvedProject = project,
  overrides: Partial<BrowserRenderOptions> = {},
) {
  let captured = 0,
    reused = 0,
    workers: number | null = null;
  await render(scene, {
    ...options,
    ...overrides,
    onMetrics: (metric) => {
      if (metric.kind === 'frame') captured++;
    },
    onProgress: (event) => {
      reused = Math.max(reused, event.reusedFrames ?? 0);
    },
    onRuntime: (event) => {
      if (event.kind === 'capture') workers = event.workers;
    },
  });
  results[name] = { captured, reused, workers };
  await writeFile(join(root, 'results.json'), JSON.stringify(results, null, 2));
  process.stdout.write(`${name}: ${captured} captured, ${reused} reused, ${workers} workers\n`);
  return results[name]!;
}

function decoded(file: string, map: string) {
  return execFileSync(
    'ffmpeg',
    ['-v', 'error', '-xerror', '-i', file, '-map', map, '-f', 'framemd5', '-'],
    { encoding: 'utf8' },
  );
}

assert.equal((await measured('initial')).captured, 75);
const referenceVideo = decoded(options.out, '0:v');
const referenceAudio = decoded(options.out, '0:a');
assert.deepEqual(await measured('identical repeat'), { captured: 0, reused: 75, workers: 0 });
assert.equal(decoded(options.out, '0:v'), referenceVideo);
assert.equal(decoded(options.out, '0:a'), referenceAudio);
assert.equal(
  (await measured('different destination', project, { out: join(root, 'another.mp4') })).captured,
  0,
);

const index = await inspectRenderCache(options.cache!.directory);
assert.equal(index.entries.length, 3);
const chunk = join(index.directory, `entry-${index.entries[0]!.key}.mp4`);
const bytes = await readFile(chunk);
bytes[Math.floor(bytes.length / 2)]! ^= 1;
await writeFile(chunk, bytes);
const repaired = await measured('corrupt one chunk');
assert(repaired.captured > 0 && repaired.captured < 75);
assert.equal(repaired.captured + repaired.reused, 75);
assert.equal(decoded(options.out, '0:v'), referenceVideo);
await rm(chunk);
const missing = await measured('missing one chunk');
assert(missing.captured > 0 && missing.captured < 75);

assert.equal((await measured('changed settings', project, { crf: 27 })).reused, 0);
assert.equal((await measured('changed project', { ...project, title: 'Changed title' })).reused, 0);
const artFile = join(fixture, 'art.svg'),
  audioFile = join(fixture, 'tone.wav');
const art = await readFile(artFile),
  audio = await readFile(audioFile);
await writeFile(artFile, art.toString().replace('#092736', '#442736'));
assert.equal((await measured('changed art')).reused, 0);
await writeFile(artFile, art);
const changedAudio = Buffer.from(audio);
changedAudio.writeInt16LE(300, 48);
await writeFile(audioFile, changedAudio);
assert.equal((await measured('changed audio')).reused, 0);
await writeFile(audioFile, audio);
assert.equal((await measured('restored inputs')).captured, 0);

const interrupted = { directory: join(root, 'interrupted-cache'), maxBytes: 32 * 1024 * 1024 };
await writeFile(options.out, sentinel);
const stop = new AbortController();
await assert.rejects(
  render(project, {
    ...options,
    cache: interrupted,
    signal: stop.signal,
    onProgress: (event) => {
      if ((event.renderedFrames ?? 0) >= 33) stop.abort(new Error('cache interruption'));
    },
  }),
  /cache interruption/,
);
assert.equal(await readFile(options.out, 'utf8'), sentinel);
assert.equal((await inspectRenderCache(interrupted.directory)).entries.length, 1);
assert.deepEqual(await measured('recover interruption', project, { cache: interrupted }), {
  captured: 45,
  reused: 30,
  workers: 1,
});
assert.equal(decoded(options.out, '0:v'), referenceVideo);

await writeFile(options.out, sentinel);
let changed = false;
await assert.rejects(
  render(project, {
    ...options,
    onProgress: (event) => {
      if (!changed && event.stage === 'frames') {
        changed = true;
        writeFileSync(audioFile, changedAudio);
      }
    },
  }),
  /input changed/,
);
assert.equal(await readFile(options.out, 'utf8'), sentinel);
await writeFile(audioFile, audio);
await clearRenderCache(options.cache!.directory);
assert.equal((await inspectRenderCache(options.cache!.directory)).bytes, 0);
assert.equal((await measured('after clear')).captured, 75);
assert.equal(decoded(options.out, '0:v'), referenceVideo);
assert.equal(decoded(options.out, '0:a'), referenceAudio);
process.stdout.write('Persistent cache: PASS\n');

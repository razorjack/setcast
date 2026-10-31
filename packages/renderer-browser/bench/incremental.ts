import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ResolvedProject } from '@setcast/core';
import { createFixture, fixtureProject } from '../../../scripts/export-acceptance/fixture.ts';
import { render, type BrowserRenderOptions } from '../src/export/index.ts';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) throw new Error('Pass --out NEW_DIRECTORY for incremental cache artifacts.');
const root = resolve(values.out);
await mkdir(root);
const fixture = join(root, 'fixture');
await mkdir(fixture);
await createFixture(fixture);
const loaded = await fixtureProject(fixture);
const project: ResolvedProject = {
  ...loaded,
  css:
    loaded.css +
    `
    .setcast > .sc-brand-message { display: block; position: absolute; inset: 80px auto auto 40px;
      transform: none; opacity: 1; color: white; font: 32px monospace; }
  `,
  announcements: [
    { at: 1.05, seconds: 0.7, text: 'Original announcement' },
    { at: 2.6, seconds: 0.4, text: 'Outside export' },
  ],
};
const options: BrowserRenderOptions = {
  projectDir: fixture,
  out: join(root, 'output.mp4'),
  range: [0, 2.5],
  chunkSeconds: 1,
  concurrency: 1,
  cache: { directory: join(root, 'cache'), maxBytes: 32 * 1024 * 1024 },
};
const results: Record<string, { captured: number; reused: number }> = {};

async function measured(
  name: string,
  scene: ResolvedProject,
  overrides: Partial<BrowserRenderOptions> = {},
) {
  let captured = 0,
    reused = 0;
  await render(scene, {
    ...options,
    ...overrides,
    onMetrics: (event) => {
      if (event.kind === 'frame') captured++;
    },
    onProgress: (event) => {
      reused = Math.max(reused, event.reusedFrames ?? 0);
    },
  });
  results[name] = { captured, reused };
  await writeFile(join(root, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  process.stdout.write(`${name}: ${captured} captured, ${reused} reused\n`);
  return results[name]!;
}

function decoded(file: string, map: string) {
  return execFileSync(
    'ffmpeg',
    ['-v', 'error', '-xerror', '-i', file, '-map', map, '-f', 'framemd5', '-'],
    { encoding: 'utf8' },
  );
}

async function matchesFresh(name: string, scene: ResolvedProject) {
  const video = decoded(options.out, '0:v');
  const audio = decoded(options.out, '0:a');
  const out = join(root, `${name}-fresh.mp4`);
  await measured(`${name} fresh`, scene, { cache: undefined, out });
  assert.equal(video, decoded(out, '0:v'), `${name}: stale or different video`);
  assert.equal(audio, decoded(out, '0:a'), `${name}: different audio`);
  return video;
}

assert.deepEqual(await measured('initial', project), { captured: 75, reused: 0 });
const original = decoded(options.out, '0:v');
const edited = {
  ...project,
  announcements: project.announcements.map((entry, index) => ({
    ...entry,
    text: index ? entry.text : 'Edited visible text',
  })),
};
assert.deepEqual(await measured('visible text edit', edited), { captured: 30, reused: 45 });
assert.notEqual(
  await matchesFresh('visible edit', edited),
  original,
  'The fixture must actually display the edited text',
);
const outside = {
  ...edited,
  announcements: edited.announcements.map((entry, index) => ({
    ...entry,
    text: index ? 'Edited outside export' : entry.text,
  })),
};
assert.deepEqual(await measured('outside range text edit', outside), { captured: 0, reused: 75 });
await matchesFresh('outside edit', outside);

const crossing = {
  ...edited,
  announcements: [{ at: 0.95, seconds: 0.3, text: 'Across a chunk boundary' }],
};
assert.deepEqual(await measured('changed metadata', crossing), { captured: 75, reused: 0 });
const crossingEdit = {
  ...crossing,
  announcements: [{ ...crossing.announcements[0]!, text: 'Both chunks change' }],
};
assert.deepEqual(await measured('crossing text edit', crossingEdit), { captured: 60, reused: 15 });
await matchesFresh('crossing edit', crossingEdit);
assert.equal(
  (
    await measured('global CSS edit', {
      ...crossingEdit,
      css: crossingEdit.css + '\n.setcast { background: #123; }',
    })
  ).reused,
  0,
);

// Checkpoints keep the complete identity even when a persistent chunk could be reused.
const sentinel = 'existing output';
await writeFile(options.out, sentinel);
const stop = new AbortController();
await assert.rejects(
  render(project, {
    ...options,
    cache: undefined,
    resume: true,
    signal: stop.signal,
    onProgress: (event) => {
      if ((event.renderedFrames ?? 0) >= 33)
        stop.abort(new Error('incremental fixture interruption'));
    },
  }),
  /incremental fixture interruption/,
);
assert.equal(await readFile(options.out, 'utf8'), sentinel);
assert.deepEqual(
  await measured('edited checkpoint invalidated', outside, { cache: undefined, resume: true }),
  { captured: 75, reused: 0 },
);
await matchesFresh('checkpoint edit', outside);
process.stdout.write('Incremental announcement cache: PASS\n');

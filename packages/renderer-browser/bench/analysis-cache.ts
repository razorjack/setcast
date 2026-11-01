import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { resolveVisualizerConfigs } from '@setcast/core';
import { loadProject, probeAudio, readWholeSet } from '@setcast/core/node';
import { themes } from '../../themes/src/index.ts';
import {
  prepareProject,
  render,
  inspectRenderCache,
  clearRenderCache,
} from '../src/export/index.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' } },
});
if (!values.out || positionals.length > 1) throw new Error('Pass [PROJECT] --out NEW_DIRECTORY.');
const projectDir = resolve(positionals[0] ?? 'examples/demo');
const out = resolve(values.out);
await mkdir(out);
const loaded = await loadProject(projectDir, {
  themes,
  probeDuration: (audio, root) => probeAudio({ audio }, root),
});
const project = {
  ...loaded.project,
  visualizers: resolveVisualizerConfigs({ name: 'overview' }),
  css: loaded.project.css + '\n.setcast { --preparation-check: var(--travel-bass); }',
};
const cache = { directory: join(out, 'cache'), maxBytes: 32 * 1024 * 1024 };
const states: string[] = [];
const options = {
  projectDir,
  cache,
  onPreparation: (status: string) => {
    states.push(status);
  },
};
const fresh = await readWholeSet(project, projectDir);
const first = await prepareProject(project, options);
const repeated = await prepareProject(project, options);
assert.deepEqual(first, fresh);
assert.deepEqual(repeated, fresh);
assert.deepEqual(states, ['computed', 'reused']);
const files = [join(out, 'cached.mp4'), join(out, 'fresh.mp4')];
for (const [index, scene] of [repeated, fresh].entries())
  await render(scene, {
    projectDir,
    out: files[index]!,
    range: [1, 2],
    concurrency: 1,
    ...(index === 0 ? { cache } : {}),
  });
const decoded = files.map((file) =>
  execFileSync(
    'ffmpeg',
    ['-v', 'error', '-xerror', '-i', file, '-map', '0:v', '-map', '0:a', '-f', 'framemd5', '-'],
    { encoding: 'utf8', timeout: 30_000 },
  ),
);
assert.equal(decoded[0], decoded[1]);
const stored = await inspectRenderCache(cache.directory);
assert.equal(stored.entries.filter((entry) => entry.kind === 'analysis').length, 1);
assert.equal(stored.entries.filter((entry) => entry.kind === 'video').length, 1);
await clearRenderCache(cache.directory);
assert.equal((await inspectRenderCache(cache.directory)).bytes, 0);
await writeFile(
  join(out, 'report.json'),
  JSON.stringify(
    {
      version: 1,
      status: 'passed',
      states,
      exactPreparation: true,
      exactDecodedVideoAndAudio: true,
      stored,
      cleared: true,
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write(
  'Analysis cache: PASS (fresh/reused summaries and decoded video/audio identical, shared inspection/clear)\n',
);

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createFixture, fixtureProject } from '../../../scripts/export-acceptance/fixture.ts';
import { render, type BrowserRenderOptions } from '../src/export/index.ts';
import type { RenderRuntime } from '@setcast/core';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) throw new Error('Pass --out NEW_DIRECTORY for scheduling validation.');
const root = resolve(values.out);
await mkdir(root);
await createFixture(root);
execFileSync('ffmpeg', [
  '-v',
  'error',
  '-i',
  join(root, 'tone.wav'),
  '-af',
  'apad',
  '-t',
  '10',
  join(root, 'extended.wav'),
]);
await rename(join(root, 'extended.wav'), join(root, 'tone.wav'));
const project = await fixtureProject(root);
const options: BrowserRenderOptions = {
  projectDir: root,
  out: join(root, 'automatic.mp4'),
  range: [0, 10],
  chunkSeconds: 1,
};
const reports: Record<string, { captured: number; reused: number; runtime: RenderRuntime[] }> = {};

async function measured(name: string, overrides: Partial<BrowserRenderOptions>) {
  const report = { captured: 0, reused: 0, runtime: [] as RenderRuntime[] };
  await render(project, {
    ...options,
    ...overrides,
    onMetrics: (metric) => {
      if (metric.kind === 'frame') report.captured++;
    },
    onProgress: (event) => {
      report.reused = Math.max(report.reused, event.reusedFrames ?? 0);
    },
    onRuntime: (event) => report.runtime.push(event),
  });
  reports[name] = report;
  await writeFile(join(root, 'report.json'), JSON.stringify(reports, null, 2));
  return report;
}
function decoded(file: string) {
  return execFileSync(
    'ffmpeg',
    ['-v', 'error', '-xerror', '-i', file, '-map', '0:v', '-map', '0:a', '-f', 'framemd5', '-'],
    { encoding: 'utf8' },
  );
}
const cache = { directory: join(root, 'cache') };
const initial = await measured('automatic', { cache });
assert.equal(initial.captured, 300);
const selected = initial.runtime.find((event) => event.kind === 'scheduling');
assert(selected?.kind === 'scheduling');
assert.equal(selected.reason, 'resource-budget');
assert.deepEqual(
  initial.runtime.find((event) => event.kind === 'capture'),
  { kind: 'capture', workers: selected.workers, parallelEncoding: true },
);
const reference = decoded(options.out);
const repeated = await measured('identical automatic repeat', { cache });
assert.equal(repeated.captured, 0);
assert.equal(repeated.reused, 300);
assert.equal(decoded(options.out), reference);
const explicit = await measured('explicit selected count', {
  cache,
  concurrency: selected.workers,
});
assert.equal(explicit.captured, 0);
assert.equal(explicit.reused, 300);
const fresh = join(root, 'fresh.mp4');
await measured('fresh explicit count', { concurrency: selected.workers, out: fresh });
assert.equal(decoded(fresh), reference);

const resumed = join(root, 'resumed.mp4');
await writeFile(resumed, 'existing output');
const stop = new AbortController();
await assert.rejects(
  render(project, {
    ...options,
    out: resumed,
    resume: true,
    signal: stop.signal,
    onProgress: (event) => {
      if ((event.renderedFrames ?? 0) >= 33) stop.abort(new Error('automatic interruption'));
    },
  }),
  /automatic interruption/,
);
assert.equal(await readFile(resumed, 'utf8'), 'existing output');
const recovered = await measured('automatic resume', { out: resumed, resume: true });
assert.equal(recovered.captured, 270);
assert.equal(recovered.reused, 30);
assert.equal(decoded(resumed), reference);
process.stdout.write(
  `Scheduling acceptance: PASS (${selected.workers} automatic workers, cache and resume pixels/audio identical)\n`,
);

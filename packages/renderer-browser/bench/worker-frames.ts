import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { themes } from '../../themes/src/index.ts';
import { createFixture, fixtureProject } from '../../../scripts/export-acceptance/fixture.ts';
import { render, withRenderSession } from '../src/export/index.ts';
import type { GraphicsBackend, RenderRuntime, ResolvedProject } from '@setcast/core';
import { qualifySourcePixels } from './worker-pixels.ts';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    theme: { type: 'string' },
    gl: { type: 'string', default: 'auto' },
    repeat: { type: 'string', default: '1' },
    workers: { type: 'string', default: '1,2,4' },
  },
});
if (!values.out) throw new Error('Pass --out NEW_DIRECTORY for worker pixel comparisons.');
const gl = values.gl as GraphicsBackend;
assert(gl === 'auto' || gl === 'default' || gl === 'angle', 'Use --gl auto, default or angle.');
const workers = values.workers!.split(',').map(Number);
assert(workers[0] === 1 && workers.length >= 2 && new Set(workers).size === workers.length);
assert(workers.every((count) => Number.isSafeInteger(count) && count >= 1 && count <= 8));
const repeat = Number(values.repeat);
assert(Number.isSafeInteger(repeat) && repeat >= 1 && repeat <= 20);
if (values.theme) assert(Object.hasOwn(themes, values.theme), 'Unknown theme');
const root = resolve(values.out);
await mkdir(root);
await createFixture(root);
const reports: {
  theme: string;
  gl: string;
  round: number;
  width: number;
  height: number;
  workers: number[];
  hashes: string[];
  equal: boolean;
  qualified: boolean;
  source?: Awaited<ReturnType<typeof qualifySourcePixels>>;
}[] = [];

await withRenderSession(async () => {
  for (let round = 0; round < repeat; round++) {
    for (const theme of values.theme ? [values.theme] : Object.keys(themes)) {
      const project = await fixtureProject(root, theme);
      for (const [width, height] of [
        [1920, 1080],
        [1080, 1920],
      ] as const) {
        await compare({ ...project, width, height }, theme, round);
      }
    }
  }
});
assert(
  reports.every((report) => report.qualified),
  'Worker count changed source theme pixels beyond the precision budget; inspect retained outputs.',
);
process.stdout.write(
  `Worker frames: PASS (${reports.length} cases, workers ${workers.join(',')}, all 45 frames per export)\n`,
);

async function compare(project: ResolvedProject, theme: string, round: number) {
  const { width, height } = project;
  const hashes: string[] = [];
  for (const concurrency of workers)
    hashes.push(await renderHash({ ...project, width, height }, `${round}-${theme}`, concurrency));
  const equal = hashes.every((hash) => hash === hashes[0]);
  const source = equal
    ? undefined
    : await qualifySourcePixels(
        { ...project, width, height },
        root,
        join(root, `${round}-${theme}-${width}-source`),
        { workers, gl },
      );
  const qualified = equal || source!.qualified;
  reports.push({ theme, gl, round, width, height, workers, hashes, equal, qualified, source });
  await writeFile(join(root, 'report.json'), JSON.stringify(reports, null, 2));
  let status = 'DIFFERENT';
  if (qualified) status = 'source rounding within precision budget';
  if (equal) status = 'identical';
  process.stdout.write(`${theme} ${width}x${height}: ${status}\n`);
}

async function renderHash(project: ResolvedProject, theme: string, concurrency: number) {
  const { width, height } = project;
  const out = join(root, `${theme}-${width}-${concurrency}.mp4`);
  process.stdout.write(`Starting ${theme} ${width}x${height}, ${concurrency} workers\n`);
  let lastFrame: number | null = null;
  const runtime: RenderRuntime[] = [];
  const result = await render(project, {
    projectDir: root,
    out,
    range: [1, 2.5],
    concurrency,
    gl,
    onRuntime: (event) => runtime.push(event),
    onMetrics: (metric) => {
      if (metric.kind === 'frame') lastFrame = metric.frame;
    },
  })
    .catch((error: unknown) => {
      process.stderr.write(
        `Failed ${theme} ${width}x${height}, ${concurrency} workers; last captured frame ${lastFrame}\n`,
      );
      throw error;
    })
    .finally(() => writeFile(`${out}.runtime.json`, JSON.stringify(runtime, null, 2)));
  assert.equal(result.frames, 45);
  return execFileSync(
    'ffmpeg',
    ['-v', 'error', '-xerror', '-i', out, '-map', '0:v', '-f', 'hash', '-hash', 'sha256', '-'],
    { encoding: 'utf8' },
  ).trim();
}

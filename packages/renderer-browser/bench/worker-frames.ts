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
    video: { type: 'boolean' },
    size: { type: 'string', default: '1920x1080' },
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
assert(/^\d+x\d+$/.test(values.size!), 'Use --size WIDTHxHEIGHT, for example 640x360.');
const dimensions = values.size!.split('x').map(Number);
assert(
  dimensions.every(
    (size) => Number.isSafeInteger(size) && size >= 2 && size <= 7680 && size % 2 === 0,
  ),
  'Use even --size dimensions between 2 and 7680 pixels.',
);
assert(dimensions[0]! > dimensions[1]!, 'Use a landscape --size; portrait runs automatically.');
const root = resolve(values.out);
await mkdir(root);
await createFixture(root);
if (values.video)
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=960x540:r=25:d=1.2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    join(root, 'motion.mp4'),
  ]);
await writeFile(
  join(root, 'identity.json'),
  JSON.stringify(
    {
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: Boolean(
        execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
          encoding: 'utf8',
        }).trim(),
      ),
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      options: values,
    },
    null,
    2,
  ),
);
const reports: {
  theme: string;
  gl: string;
  round: number;
  width: number;
  height: number;
  workers: number[];
  hashes: string[];
  equal: boolean;
  repeatEqual: boolean;
  video: boolean;
  qualified: boolean;
  source?: Awaited<ReturnType<typeof qualifySourcePixels>>;
}[] = [];

await withRenderSession(async () => {
  for (let round = 0; round < repeat; round++) {
    for (const theme of values.theme ? [values.theme] : Object.keys(themes)) {
      const project = await fixtureProject(root, theme);
      if (values.video) project.background = 'motion.mp4';
      for (const [width, height] of [dimensions, [...dimensions].reverse()] as const) {
        const scene = { ...project, width: width!, height: height! };
        await compare(scene, theme, round);
      }
    }
  }
});
assert(
  reports.every((report) => report.qualified),
  'Worker or repeated-export pixels failed qualification; inspect retained outputs and source comparisons.',
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
  const previous = reports.find(
    (report) => report.theme === theme && report.width === width && report.height === height,
  );
  const repeatEqual = !previous || hashes.every((hash) => hash === previous.hashes[0]);
  const report: (typeof reports)[number] = {
    theme,
    gl,
    round,
    width,
    height,
    workers,
    hashes,
    equal,
    repeatEqual,
    video: Boolean(values.video),
    qualified: equal && repeatEqual,
  };
  reports.push(report);
  await writeFile(join(root, 'report.json'), JSON.stringify(reports, null, 2));
  const source =
    equal && repeatEqual
      ? undefined
      : await qualifySourcePixels(
          { ...project, width, height },
          root,
          join(root, `${round}-${theme}-${width}-source`),
          { workers, gl },
        );
  // Video regression qualification keeps exact decoded equality, including fresh-page repeats.
  const qualified = report.qualified || (!values.video && Boolean(source?.qualified));
  Object.assign(report, { qualified, source });
  await writeFile(join(root, 'report.json'), JSON.stringify(reports, null, 2));
  let status = 'DIFFERENT';
  if (qualified) status = 'source rounding within precision budget';
  if (equal && repeatEqual) status = 'identical';
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

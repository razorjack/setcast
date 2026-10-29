import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createFixture, fixtureProject } from '../../../scripts/export-acceptance/fixture.ts';
import { measureLoad, verifyVideo } from '../../../scripts/render-compare/measure.ts';
import { render, type BrowserMetric } from '../src/export/index.ts';
import { prepareFrame, withCapture, withRenderSession } from '../src/export/session.ts';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
if (!values.out) throw new Error('Pass --out NEW_DIRECTORY for the decoded-video comparison.');
const out = resolve(values.out);
const controller = new AbortController();
for (const name of ['SIGINT', 'SIGTERM'] as const)
  process.once(name, () => controller.abort(new Error(`Stopped by ${name}.`)));
await mkdir(out);
await createFixture(out);
execFileSync('ffmpeg', [
  '-v',
  'error',
  '-f',
  'lavfi',
  '-i',
  'testsrc2=s=1920x1080:r=25:d=1.2',
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  join(out, 'motion.mp4'),
]);
const fixture = await fixtureProject(out, 'sterile-tech');
const project = { ...fixture, width: 1920, height: 1080, background: 'motion.mp4' };
await withRenderSession(() =>
  withCapture(project, { projectDir: out }, async (page) => {
    await prepareFrame(page, 0);
    const element = await page
      .locator('.sc-bg-img')
      .first()
      .evaluate((node) => node.tagName);
    if (element !== 'CANVAS')
      throw new Error('Apply the archived video-canvas experiment patch before profiling.');
  }),
);
const runs = [];
for (let pair = 0; pair < 3; pair++) {
  for (const mode of pair % 2 ? ['image', 'canvas'] : ['canvas', 'image']) {
    const scene =
      mode === 'canvas'
        ? project
        : {
            ...project,
            css: `${project.css}\n.setcast-image-reference img { visibility: hidden; }`,
          };
    const stats: Record<string, number> = {};
    const onMetrics = (metric: BrowserMetric) => {
      if (metric.kind !== 'frame') {
        stats[metric.kind] = (stats[metric.kind] ?? 0) + metric.milliseconds;
        return;
      }
      for (const key of [
        'audioMs',
        'resolveMs',
        'commitMs',
        'readinessMs',
        'captureMs',
        'bytes',
      ] as const)
        stats[key] = (stats[key] ?? 0) + metric[key];
    };
    const load = measureLoad();
    const started = performance.now();
    try {
      const result = await render(scene, {
        projectDir: out,
        out: join(out, `${pair}-${mode}.mp4`),
        range: [0, 3],
        signal: controller.signal,
        concurrency: 1,
        onMetrics,
      });
      const wallSeconds = (performance.now() - started) / 1000;
      const observedLoad = load.stop();
      const verification = await verifyVideo(
        result.file,
        { ...project, frames: 90 },
        controller.signal,
      );
      runs.push({ pair, mode, wallSeconds, stats, load: observedLoad, verification });
      await writeFile(join(out, 'report.json'), JSON.stringify({ runs }, null, 2));
      process.stdout.write(
        `${pair} ${mode}: ${wallSeconds.toFixed(3)} s, readiness ${stats.readinessMs!.toFixed(1)} ms\n`,
      );
    } finally {
      load.stop();
    }
  }
}

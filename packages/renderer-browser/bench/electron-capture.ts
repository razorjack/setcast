import { execFile, execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { framesWithinMix, type RenderRuntime } from '@setcast/core';
import { loadProject, probeAudio, WholeSetReader } from '@setcast/core/node';
import { themes } from '../../themes/src/index.ts';
import { bundlePlayer } from '../src/bundle.ts';
import { serveCapture } from '../src/server.ts';
import { captureBrowserArgs } from '../src/export/graphics.ts';
import { prepareFrame, withCapture, withRenderSession } from '../src/export/session.ts';
import { pixelDifference } from './worker-pixels.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    electron: { type: 'string' },
    capture: { type: 'string', default: 'page' },
    theme: { type: 'string', default: 'sterile-tech' },
    frames: { type: 'string', default: '3149,3150,3151,3029,3030,3149' },
  },
});
if (!values.out || !values.electron || positionals.length !== 1)
  throw new Error(
    'Pass PROJECT --out NEW_DIRECTORY --electron EXECUTABLE [--theme all|NAME] [--frames CSV].',
  );
if (!['page', 'paint'].includes(values.capture)) throw new Error('Use --capture page or paint.');
const out = resolve(values.out);
const projectDir = resolve(positionals[0]!);
const frames = values.frames.split(',').map(Number);
if (!values.frames.trim() || frames.some((frame) => !Number.isSafeInteger(frame) || frame < 0))
  throw new Error('Frames must be nonnegative integers.');
await mkdir(out);
const files = await bundlePlayer('export.tsx');
const reader = new WholeSetReader();
const report = {
  version: 1,
  runtime: [] as RenderRuntime[],
  capture: values.capture,
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  scope:
    'Pixel feasibility only. Native Electron bitmap versus same-host CDP PNG and pinned Playwright PNG. Stage timings are not quiet throughput measurements.',
  results: [] as {
    id: string;
    frame: number;
    index: number;
    nativeVsCdp: ReturnType<typeof pixelDifference>;
    nativeVsPlaywright: ReturnType<typeof pixelDifference>;
  }[],
  qualified: false,
  status: 'running',
  error: null as string | null,
};
const jobs: { id: string; url: string; width: number; height: number; frames: number[] }[] = [];
try {
  await using servers = new AsyncDisposableStack();
  await withRenderSession(async () => {
    for (const theme of values.theme === 'all' ? Object.keys(themes) : [values.theme]) {
      const loaded = await loadProject(projectDir, {
        themes,
        theme,
        probeDuration: (audio, root) => probeAudio({ audio }, root),
      });
      const prepared = await reader.read(loaded.project, projectDir);
      if (frames.some((frame) => frame >= framesWithinMix(prepared.mix.duration, prepared.fps)))
        throw new Error('Frame exceeds mix duration.');
      for (const [width, height] of [
        [1920, 1080],
        [1080, 1920],
      ] as const) {
        const project = { ...prepared, width, height };
        const id = `${theme}-${width}x${height}`;
        const server = await serveCapture(project, { projectDir, files });
        servers.defer(() => server.close());
        jobs.push({ id, url: server.url, width, height, frames });
        const directory = join(out, id);
        await mkdir(directory);
        await withCapture(
          project,
          { projectDir, onRuntime: (event) => report.runtime.push(event) },
          async (page) => {
            for (const [index, frame] of frames.entries()) {
              await prepareFrame(page, frame);
              await page.screenshot({
                type: 'png',
                path: join(directory, `${index}-playwright.png`),
              });
            }
          },
        );
      }
    }
  });
  const config = join(out, 'config.json');
  await writeFile(
    config,
    JSON.stringify({ out, jobs, capture: values.capture, args: captureBrowserArgs() }),
  );
  const host = fileURLToPath(new URL('./electron-capture-host.mjs', import.meta.url));
  const executed = await promisify(execFile)(resolve(values.electron), [host, config], {
    timeout: 600_000,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
  });
  await writeFile(join(out, 'host.log'), executed.stdout + executed.stderr);
  const hostReport = JSON.parse(await readFile(join(out, 'electron-report.json'), 'utf8'));
  if (
    hostReport.status !== 'measured' ||
    hostReport.samples.length !== jobs.reduce((sum, job) => sum + job.frames.length, 0)
  )
    throw new Error('Native host did not complete every requested frame.');
  for (const job of jobs) await compareJob(job);
  report.qualified = report.results.every(
    (result) => result.nativeVsCdp.qualified && result.nativeVsPlaywright.qualified,
  );
  report.status = 'measured';
} catch (error) {
  if (error && typeof error === 'object') {
    const execution = error as { stdout?: string; stderr?: string };
    if (execution.stdout || execution.stderr)
      await writeFile(join(out, 'host.log'), (execution.stdout ?? '') + (execution.stderr ?? ''));
  }
  report.status = 'failed';
  report.error = String(error);
  throw error;
} finally {
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

async function compareJob(job: (typeof jobs)[number]) {
  for (const [index, frame] of job.frames.entries()) {
    const directory = join(out, job.id);
    const bitmap = await readFile(join(directory, `${index}.bgra`));
    const rgb = Buffer.alloc(job.width * job.height * 3);
    for (let pixel = 0; pixel < rgb.length / 3; pixel++) {
      rgb[pixel * 3] = bitmap[pixel * 4 + 2]!;
      rgb[pixel * 3 + 1] = bitmap[pixel * 4 + 1]!;
      rgb[pixel * 3 + 2] = bitmap[pixel * 4]!;
    }
    const cdp = decode(join(directory, `${index}-cdp.png`));
    const playwright = decode(join(directory, `${index}-playwright.png`));
    report.results.push({
      id: job.id,
      frame,
      index,
      nativeVsCdp: pixelDifference(cdp, rgb),
      nativeVsPlaywright: pixelDifference(playwright, rgb),
    });
    await rm(join(directory, `${index}.bgra`));
  }
}
function decode(file: string) {
  return execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
    { maxBuffer: 32 * 1024 * 1024 },
  );
}

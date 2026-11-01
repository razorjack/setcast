import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Page } from 'playwright';
import {
  type RenderRuntime,
  exportSettings,
  framesWithinMix,
  resolveFrameRange,
  splitFrameRange,
} from '@setcast/core';
import { loadProject, probeAudio, WholeSetReader } from '@setcast/core/node';
import { themes } from '../../themes/src/index.ts';
import { waitForIdle } from '../../../scripts/render-compare/idle.ts';
import { measureLoad, verifyVideo } from '../../../scripts/render-compare/measure.ts';
import { measureProcesses } from '../../../scripts/render-compare/process-monitor.ts';
import {
  assemble,
  encodeAudio,
  exportEncoding,
  preflight,
  videoArgs,
} from '../src/export/encoding.ts';
import { ffmpeg } from '../src/export/ffmpeg.ts';
import { atomicOutput } from '../src/export/output.ts';
import { pipeline } from '../src/export/pipeline.ts';
import { prepareFrame, withCapturePages, withRenderSession } from '../src/export/session.ts';
import { renderTracks } from '../src/export/tracks.ts';
import { digest, digestFile, projectAssets } from '../src/export/identity.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    at: { type: 'string', default: '90' },
    seconds: { type: 'string', default: '12' },
    chunk: { type: 'string', default: '3' },
    repeat: { type: 'string', default: '1' },
    'idle-busy': { type: 'string', default: '1' },
  },
});
if (!values.out || positionals.length !== 1)
  throw new Error('Pass PROJECT --out NEW_DIRECTORY [--repeat 3 --idle-busy .15].');
const controller = new AbortController();
for (const name of ['SIGINT', 'SIGTERM'] as const)
  process.once(name, () => controller.abort(new Error(`Stopped by ${name}.`)));
const out = resolve(values.out),
  projectDir = resolve(positionals[0]!);
const at = Number(values.at),
  seconds = Number(values.seconds),
  chunk = Number(values.chunk);
const repeat = Number(values.repeat),
  idleBusy = Number(values['idle-busy']);
assert(Number.isFinite(at) && at >= 0 && seconds > 0 && Number.isFinite(seconds));
assert(
  Number.isFinite(chunk) && chunk > 0 && Number.isInteger(repeat) && repeat > 0 && repeat <= 10,
);
assert(idleBusy > 0 && idleBusy <= 1);
await mkdir(out);
const loaded = await loadProject(projectDir, {
  themes,
  probeDuration: (audio, root) => probeAudio({ audio }, root),
});
const project = await new WholeSetReader().read(loaded.project, projectDir);
const range = resolveFrameRange(
  [at, at + seconds],
  project.fps,
  framesWithinMix(project.mix.duration, project.fps),
);
const ranges = splitFrameRange(range, chunk * project.fps);
const duration = (range[1] - range[0] + 1) / project.fps;
const options = {
  ...exportSettings(loaded.config.output),
  projectDir,
  concurrency: 4,
  hardwareAcceleration: 'disable' as const,
  out: '',
  chunkSeconds: chunk,
};
const encoding = exportEncoding(options);
assert.equal(encoding.codec, 'h264');
const assets = await Promise.all(
  projectAssets(project).map(async (path) => ({
    path,
    ...(await digestFile(resolve(projectDir, path))),
  })),
);
const report = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  identity: digest(JSON.stringify({ project, assets })),
  range,
  ranges,
  encoding,
  idleBusy,
  scope:
    'Four capture pages. Identical chunk boundaries and settings; round-robin frames per sequential chunk versus one page and encoder per concurrent chunk. Includes preflight, session setup, continuous master audio, capture, encoding, mux and cleanup; excludes project preparation and verification.',
  runtime: [] as RenderRuntime[],
  results: [] as unknown[],
  status: 'running',
  error: null as string | null,
};
let reference: string | undefined;
try {
  for (let round = 0; round < repeat; round++) {
    const order = round % 2 === 0 ? ['frames', 'chunks'] : ['chunks', 'frames'];
    for (const mode of order) await measured(round, mode);
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
  throw error;
} finally {
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
}

async function measured(round: number, mode: string) {
  await waitForIdle(idleBusy, controller.signal);
  const processes = await measureProcesses(),
    load = measureLoad();
  const file = join(out, `${round}-${mode}.mp4`),
    start = performance.now();
  try {
    await exportCase(file, mode);
    const wallSeconds = (performance.now() - start) / 1000;
    const observedLoad = load.stop(),
      observedProcesses = await processes.stop();
    const video = await verifyVideo(
      file,
      { ...project, frames: range[1] - range[0] + 1 },
      controller.signal,
    );
    const decoded = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-xerror', '-i', file, '-map', '0:v', '-map', '0:a', '-f', 'framemd5', '-'],
      { encoding: 'utf8' },
    );
    reference ??= decoded;
    const exact = decoded === reference;
    report.results.push({
      round,
      mode,
      wallSeconds,
      exact,
      video,
      load: observedLoad,
      processes: observedProcesses,
    });
    await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
    assert(exact, 'Scheduling changed decoded video or audio.');
    process.stdout.write(`${mode}: ${wallSeconds.toFixed(3)} s, exact decoded video/audio\n`);
  } finally {
    load.stop();
    await processes.stop();
  }
}

async function captureChunks(pages: Page[], mode: string, directory: string, signal: AbortSignal) {
  if (mode === 'frames') {
    for (const [index, range] of ranges.entries())
      await encode(pages, { index, range, directory, signal });
    return;
  }
  let next = 0;
  const workers = pages.map(async (page) => {
    while (next < ranges.length) {
      const index = next++;
      await encode([page], { index, range: ranges[index]!, directory, signal });
    }
  });
  try {
    await Promise.all(workers);
  } catch (error) {
    await Promise.allSettled(pages.map((page) => page.close()));
    await Promise.allSettled(workers);
    throw error;
  }
}

async function encode(
  pages: Page[],
  job: { index: number; range: [number, number]; directory: string; signal: AbortSignal },
) {
  const encoder = ffmpeg(
    videoArgs(project.fps, encoding, join(job.directory, `chunk-${job.index}.mp4`)),
    job.signal,
  );
  try {
    await pipeline({
      range: job.range,
      workers: pages.length,
      capture: async (worker, frame) => {
        job.signal.throwIfAborted();
        const page = pages[worker]!;
        await prepareFrame(page, frame);
        return page.screenshot({ type: 'jpeg', quality: encoding.jpegQuality });
      },
      write: (bytes) => encoder.write(bytes),
      cancel: () => Promise.allSettled([...pages.map((page) => page.close()), encoder.cancel()]),
    });
    await encoder.finish();
  } catch (error) {
    await encoder.cancel();
    throw error;
  }
}

async function exportCase(file: string, mode: string) {
  await withRenderSession(async () => {
    await preflight(controller.signal);
    await atomicOutput(file, controller.signal, async (output, directory) => {
      const job = { output, directory, ranges, duration };
      await renderTracks(controller.signal, {
        audio: (signal) => encodeAudio(project, { ...options, signal }, job),
        video: (signal) =>
          withCapturePages(
            project,
            { projectDir, signal, onRuntime: (event) => report.runtime.push(event) },
            4,
            (pages) => captureChunks(pages, mode, directory, signal),
          ),
      });
      await assemble(project, { ...options, signal: controller.signal }, job);
    });
  });
}

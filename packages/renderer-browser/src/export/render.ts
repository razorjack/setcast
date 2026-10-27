import { join, resolve } from 'node:path';
import type { Page } from 'playwright';
import {
  requireVideoOutput,
  framesWithinMix,
  resolveFrameRange,
  splitFrameRange,
  type ResolvedProject,
  type RenderOptions,
  type RenderResult,
} from '@setcast/core';
import { prepareFrame, withCapture, withRenderSession } from './session.ts';
import { atomicOutput } from './output.ts';
import { graphicsArgs } from './graphics.ts';
import { assemble, exportEncoding, videoArgs, preflight } from './encoding.ts';
import { measure, type MetricsReport } from './metrics.ts';
import { ffmpeg } from './ffmpeg.ts';
import { fingerprint } from './fingerprint.ts';
import { withCheckpoint, type Checkpoint } from './checkpoint.ts';
import { validateChunk } from './probe.ts';
import { pipeline } from './pipeline.ts';

export type BrowserRenderOptions = RenderOptions & {
  onMetrics?: MetricsReport;
};

export function render(
  project: ResolvedProject,
  options: BrowserRenderOptions,
): Promise<RenderResult> {
  graphicsArgs(options.gl);
  requireVideoOutput(options.out);
  const encoding = exportEncoding(options);
  const total = framesWithinMix(project.mix.duration, project.fps);
  const range = options.range
    ? resolveFrameRange(options.range, project.fps, total)
    : ([0, total - 1] as [number, number]);
  const ranges = splitFrameRange(range, encoding.chunkSeconds * project.fps);
  const frames = range[1] - range[0] + 1;
  return withRenderSession(() =>
    renderJob({ project, options, encoding, ranges, frames, first: range[0] }),
  );
}

interface RenderJob {
  project: ResolvedProject;
  options: BrowserRenderOptions & { assetPaths?: readonly string[] };
  encoding: ReturnType<typeof exportEncoding>;
  ranges: [number, number][];
  frames: number;
  first: number;
  identity?: Awaited<ReturnType<typeof fingerprint>>;
  checkpoint?: Checkpoint;
}

async function renderJob(job: RenderJob) {
  await preflight(job.options.signal);
  if (!job.options.resume) return renderOutput(job);
  const identity = await fingerprint(job.project, job.options, job.ranges);
  return withCheckpoint(job.options.out, identity, (checkpoint) =>
    renderOutput({
      ...job,
      identity,
      checkpoint,
      options: { ...job.options, assetPaths: identity.paths },
    }),
  );
}

function renderOutput(job: RenderJob) {
  const { project, options, ranges, frames } = job;
  return atomicOutput(options.out, options.signal, async (output, directory) => {
    await renderChunks(job, directory);
    await job.identity?.unchanged();
    encodeProgress(options, frames, 0);
    await measure('mux', options.onMetrics, () =>
      assemble(project, options, {
        directory,
        output,
        ranges,
        duration: frames / project.fps,
      }),
    );
    await job.identity?.unchanged();
    encodeProgress(options, frames, 1);
    return { file: resolve(options.out), frames, durationSeconds: frames / project.fps };
  });
}

async function renderChunks(job: RenderJob, directory: string) {
  const reusable: boolean[] = [];
  for (const [index, range] of job.ranges.entries()) {
    const file = join(directory, `chunk-${index}.mp4`);
    reusable.push((await job.checkpoint?.reuse(index, range, file, job.options.signal)) ?? false);
  }
  const capture = (pages: Page[]) => renderPreparedChunks(job, { directory, reusable }, pages);
  if (reusable.every(Boolean)) await capture([]);
  else await capturePool(job.project, job.options, [], capture);
}

async function renderPreparedChunks(
  job: RenderJob,
  prepared: { directory: string; reusable: boolean[] },
  pages: Page[],
) {
  let reusedFrames = 0;
  for (const [index, range] of job.ranges.entries()) {
    await job.identity?.unchanged();
    job.options.signal?.throwIfAborted();
    const out = join(prepared.directory, `chunk-${index}.mp4`);
    if (prepared.reusable[index]) {
      reusedFrames += range[1] - range[0] + 1;
      frameProgress(job, range[1] - job.first + 1, reusedFrames);
      continue;
    }
    await encodeChunk(pages, range, { ...job, out, reusedFrames });
    await job.identity?.unchanged();
    if (job.checkpoint) {
      await validateChunk(
        out,
        { ...job.project, frames: range[1] - range[0] + 1 },
        job.options.signal,
      );
      await job.checkpoint.save(index, range, out, job.options.signal);
    }
  }
}

function capturePool<T>(
  project: ResolvedProject,
  options: RenderJob['options'],
  pages: Page[],
  task: (pages: Page[]) => Promise<T>,
): Promise<T> {
  if (pages.length === (options.concurrency ?? 1)) return task(pages);
  return withCapture(project, options, (page) =>
    capturePool(project, options, [...pages, page], task),
  );
}

interface ChunkJob {
  project: ResolvedProject;
  options: BrowserRenderOptions;
  encoding: ReturnType<typeof exportEncoding>;
  out: string;
  first: number;
  frames: number;
  reusedFrames: number;
}

async function encodeChunk(pages: Page[], range: [number, number], job: ChunkJob) {
  const { project, options, encoding } = job;
  const encoder = ffmpeg(videoArgs(project.fps, encoding, job.out), options.signal);
  try {
    await pipeline({
      range,
      workers: pages.length,
      capture: (worker, frame) => {
        options.signal?.throwIfAborted();
        return captureFrame(pages[worker]!, frame, job);
      },
      write: async (image, frame) => {
        await measure('encoder-write', options.onMetrics, () => encoder.write(image));
        frameProgress(job, frame - job.first + 1, job.reusedFrames);
      },
      cancel: () => Promise.allSettled([...pages.map((page) => page.close()), encoder.cancel()]),
    });
    await measure('encoder-finish', options.onMetrics, () => encoder.finish());
  } catch (error) {
    await encoder.cancel();
    throw error;
  }
}

async function captureFrame(page: Page, frame: number, job: ChunkJob) {
  const timings = await prepareFrame(page, frame);
  const started = performance.now();
  const image = await page.screenshot({ type: 'jpeg', quality: job.encoding.jpegQuality });
  job.options.onMetrics?.({
    kind: 'frame',
    frame,
    ...timings,
    captureMs: performance.now() - started,
    bytes: image.length,
  });
  return image;
}

function encodeProgress(options: BrowserRenderOptions, frames: number, progress: number) {
  options.onProgress?.({ stage: 'encode', progress, renderedFrames: frames, totalFrames: frames });
}

function frameProgress(
  job: Pick<RenderJob, 'options' | 'frames'>,
  renderedFrames: number,
  reusedFrames: number,
) {
  job.options.onProgress?.({
    stage: 'frames',
    progress: renderedFrames / job.frames,
    renderedFrames,
    totalFrames: job.frames,
    reusedFrames,
  });
}

import { join, resolve } from 'node:path';
import type { Page } from 'playwright';
import {
  requireVideoOutput,
  framesWithinMix,
  resolveFrameRange,
  splitFrameRange,
  type OutputConfig,
  type ResolvedProject,
  type RenderOptions,
  type RenderResult,
} from '@setcast/core';
import { prepareFrame, withCapturePages, withRenderSession } from './session.ts';
import { atomicOutput } from './output.ts';
import { validateGraphicsBackend } from './graphics.ts';
import { assemble, encodeAudio, exportEncoding, videoArgs, preflight } from './encoding.ts';
import { measure, type MetricsReport } from './metrics.ts';
import { ffmpeg } from './ffmpeg.ts';
import { computeExportIdentity } from './identity.ts';
import {
  checkpointChunks,
  DISPOSABLE_CHUNKS,
  withCheckpoint,
  type ChunkStore,
} from './checkpoint.ts';
import { pipeline } from './pipeline.ts';
import { renderTracks } from './tracks.ts';
import { resolveHardwareEncoding, type VideoEncoder } from './hardware.ts';

export type BrowserRenderOptions = RenderOptions & {
  onMetrics?: MetricsReport;
};

type FrameRange = [number, number];

export function render(
  project: ResolvedProject,
  options: BrowserRenderOptions,
): Promise<RenderResult> {
  validateGraphicsBackend(options.gl);
  requireVideoOutput(options.out);
  const encoding = exportEncoding(options);
  const range = renderedFrames(project, options.range);
  const job: RenderJob = {
    project,
    options,
    encoding,
    encoder: 'libx264',
    ranges: splitFrameRange(range, encoding.chunkSeconds * project.fps),
    first: range[0],
    frames: range[1] - range[0] + 1,
  };
  return withRenderSession(() => renderJob(job));
}

function renderedFrames(project: ResolvedProject, range: [number, number] | undefined) {
  const total = framesWithinMix(project.mix.duration, project.fps);
  if (!range) return [0, total - 1] satisfies FrameRange;
  return resolveFrameRange(range, project.fps, total);
}

interface RenderJob {
  project: ResolvedProject;
  options: BrowserRenderOptions & { assetPaths?: readonly string[] };
  encoding: OutputConfig;
  encoder: VideoEncoder;
  ranges: FrameRange[];
  /** The first frame of the export. */
  first: number;
  frames: number;
}

async function renderJob(job: RenderJob) {
  const hardware = await resolveHardwareEncoding(job.encoding.hardwareAcceleration, {
    width: job.project.width,
    height: job.project.height,
    fps: job.project.fps,
    videoBitrate: job.encoding.videoBitrate,
    signal: job.options.signal,
  });
  const options = { ...job.options, hardwareAcceleration: hardware.hardwareAcceleration };
  job = { ...job, options, encoding: exportEncoding(options), encoder: hardware.encoder };
  options.onRuntime?.({
    kind: 'encoding-selection',
    encoder: hardware.encoder,
    fallback: hardware.fallback ?? null,
  });
  if (hardware.encoder === 'libx264') await preflight(options.signal);
  if (!job.options.resume) return renderOutput(job, DISPOSABLE_CHUNKS);

  job.options.onProgress?.({ stage: 'checkpoint', progress: 0 });
  const identity = await computeExportIdentity(job.project, job.options, job.ranges);
  const resumable = { ...job, options: { ...job.options, assetPaths: identity.paths } };
  return withCheckpoint(job.options.out, identity, (checkpoint) =>
    renderOutput(resumable, checkpointChunks(checkpoint, identity, job.project)),
  );
}

function renderOutput(job: RenderJob, chunks: ChunkStore) {
  const { project, options, ranges, frames } = job;
  return atomicOutput(options.out, options.signal, async (output, directory) => {
    const assembly = { directory, output, ranges, duration: frames / project.fps };
    await renderTracks(options.signal, {
      video: (signal) =>
        renderChunks({ ...job, options: { ...options, signal } }, chunks, directory),
      audio: (signal) =>
        measure('audio-encode', options.onMetrics, () =>
          encodeAudio(project, { ...options, signal }, assembly),
        ),
    });
    await chunks.assertInputsUnchanged();
    encodeProgress(options, frames, 0);
    await measure('mux', options.onMetrics, () => assemble(project, options, assembly));
    await chunks.assertInputsUnchanged();
    encodeProgress(options, frames, 1);
    return { file: resolve(options.out), frames, durationSeconds: frames / project.fps };
  });
}

async function renderChunks(job: RenderJob, chunks: ChunkStore, directory: string) {
  const reused: boolean[] = [];
  for (const [index, range] of job.ranges.entries()) {
    reused.push(await chunks.reuse(index, range, chunkFile(directory, index), job.options.signal));
  }
  const workers = reused.every(Boolean) ? 0 : (job.options.concurrency ?? 1);
  job.options.onRuntime?.({ kind: 'capture', workers, parallelEncoding: true });
  await withCapturePages(job.project, job.options, workers, async (pages) => {
    let reusedFrames = 0;
    for (const [index, range] of job.ranges.entries()) {
      await chunks.assertInputsUnchanged();
      job.options.signal?.throwIfAborted();
      if (reused[index]) {
        reusedFrames += range[1] - range[0] + 1;
        frameProgress(job, range[1] - job.first + 1, reusedFrames);
        continue;
      }
      const out = chunkFile(directory, index);
      await encodeChunk(pages, range, { ...job, out, reusedFrames });
      await chunks.assertInputsUnchanged();
      await chunks.save(index, range, out, job.options.signal);
    }
  });
}

const chunkFile = (directory: string, index: number) => join(directory, `chunk-${index}.mp4`);

interface ChunkJob extends RenderJob {
  out: string;
  reusedFrames: number;
}

async function encodeChunk(pages: Page[], range: [number, number], job: ChunkJob) {
  const { project, options, encoding } = job;
  const encoder = ffmpeg(videoArgs(project.fps, encoding, job.out, job.encoder), options.signal);
  try {
    options.onRuntime?.({ kind: 'encoder', encoder: job.encoder, pipeline: 'stream' });
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

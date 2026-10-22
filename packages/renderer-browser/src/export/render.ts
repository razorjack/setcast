import { join, resolve } from 'node:path';
import type { Page } from 'playwright';
import {
  framesWithinMix,
  resolveFrameRange,
  splitFrameRange,
  SetcastError,
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

export type BrowserRenderOptions = RenderOptions & {
  onMetrics?: MetricsReport;
};

export function render(
  project: ResolvedProject,
  options: BrowserRenderOptions,
): Promise<RenderResult> {
  graphicsArgs(options.gl);
  if (!/\.(mp4|mov|mkv)$/i.test(options.out))
    throw new SetcastError(`Cannot write video ${options.out}.`, 'Use .mp4, .mov or .mkv.');
  const encoding = exportEncoding(options);
  const total = framesWithinMix(project.mix.duration, project.fps);
  const range = options.range
    ? resolveFrameRange(options.range, project.fps, total)
    : ([0, total - 1] as [number, number]);
  const ranges = splitFrameRange(range, encoding.chunkSeconds * project.fps);
  const frames = range[1] - range[0] + 1;
  return withRenderSession(() =>
    atomicOutput(options.out, options.signal, async (output, directory) => {
      await preflight(options.signal);
      await capturePool(project, options, [], async (pages) => {
        for (const [index, chunk] of ranges.entries()) {
          await encodeChunk(pages, chunk, {
            project,
            options,
            encoding,
            out: join(directory, `chunk-${index}.mp4`),
            first: range[0],
            frames,
          });
        }
      });
      encodeProgress(options, frames, 0);
      await measure('mux', options.onMetrics, () =>
        assemble(project, options, {
          directory,
          output,
          ranges,
          duration: frames / project.fps,
        }),
      );
      encodeProgress(options, frames, 1);
      return { file: resolve(options.out), frames, durationSeconds: frames / project.fps };
    }),
  );
}

function capturePool<T>(
  project: ResolvedProject,
  options: RenderOptions,
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
}

async function encodeChunk(pages: Page[], range: [number, number], job: ChunkJob) {
  const { project, options, encoding } = job;
  const encoder = ffmpeg(videoArgs(project.fps, encoding, job.out), options.signal);
  try {
    for (let first = range[0]; first <= range[1]; first += pages.length) {
      const batch = pages.slice(0, range[1] - first + 1);
      const images = await Promise.all(
        batch.map(async (page, index) => {
          options.signal?.throwIfAborted();
          return captureFrame(page, first + index, job);
        }),
      );
      for (const image of images)
        await measure('encoder-write', options.onMetrics, () => encoder.write(image));
      const renderedFrames = first - job.first + images.length;
      options.onProgress?.({
        stage: 'frames',
        progress: renderedFrames / job.frames,
        renderedFrames,
        totalFrames: job.frames,
      });
    }
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

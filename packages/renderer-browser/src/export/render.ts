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
import { ffmpeg } from './ffmpeg.ts';

export function render(project: ResolvedProject, options: RenderOptions): Promise<RenderResult> {
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
      options.onProgress?.({
        stage: 'encode',
        progress: 0,
        renderedFrames: frames,
        totalFrames: frames,
      });
      await assemble(project, options, {
        directory,
        output,
        ranges,
        duration: frames / project.fps,
      });
      options.onProgress?.({
        stage: 'encode',
        progress: 1,
        renderedFrames: frames,
        totalFrames: frames,
      });
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
  options: RenderOptions;
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
          await prepareFrame(page, first + index);
          return page.screenshot({ type: 'jpeg', quality: encoding.jpegQuality });
        }),
      );
      for (const image of images) await encoder.write(image);
      const renderedFrames = first - job.first + images.length;
      options.onProgress?.({
        stage: 'frames',
        progress: renderedFrames / job.frames,
        renderedFrames,
        totalFrames: job.frames,
      });
    }
    await encoder.finish();
  } catch (error) {
    await encoder.cancel();
    throw error;
  }
}

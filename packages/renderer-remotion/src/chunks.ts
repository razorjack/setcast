import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import {
  renderMedia,
  makeCancelSignal,
  type RenderMediaOptions,
  type RenderMediaOnProgress,
} from '@remotion/renderer';
import { OutputSchema, SetcastError } from '@setcast/core';
import type { RenderProgress } from './index.ts';
import { encodeMasterAudio, muxChunks } from './mux.ts';
import { canPipeline, renderChunkPipeline } from './chunk-pipeline.ts';

type FrameRange = [number, number];
type VideoJob = RenderMediaOptions & { outputLocation: string };
type Report = (progress: RenderProgress) => void;
interface ChunkOptions {
  frameRange: FrameRange;
  chunkSeconds: number;
  audio: string | null;
  report: Report;
}

export function resolveChunkSeconds(chunkSeconds: number | undefined): number {
  const parsed = OutputSchema.safeParse({ chunkSeconds });
  if (!parsed.success) {
    throw new SetcastError(
      `Invalid render chunkSeconds: ${chunkSeconds}`,
      parsed.error.issues.map((issue) => issue.message).join(' '),
      { cause: parsed.error },
    );
  }
  return parsed.data.chunkSeconds;
}

/** Inclusive absolute ranges; only the final chunk may be shorter than the chosen size. */
export function splitFrameRange(range: FrameRange, framesPerChunk: number): FrameRange[] {
  if (framesPerChunk === 0) return [range];
  const ranges: FrameRange[] = [];
  for (let start = range[0]; start <= range[1]; start += framesPerChunk) {
    ranges.push([start, Math.min(range[1], start + framesPerChunk - 1)]);
  }
  return ranges;
}

export async function renderVideo(job: VideoJob, options: ChunkOptions): Promise<void> {
  const { fps } = job.composition;
  const ranges = splitFrameRange(options.frameRange, options.chunkSeconds * fps);
  const totalFrames = options.frameRange[1] - options.frameRange[0] + 1;
  if (ranges.length === 1) {
    await renderMedia({
      ...job,
      frameRange: options.frameRange,
      onProgress: mediaProgress(totalFrames, options.report),
    });
    return;
  }
  // Keep the destination intact on failure, and rename atomically on its own filesystem.
  await mkdir(dirname(job.outputLocation), { recursive: true });
  const dir = await mkdtemp(join(dirname(job.outputLocation), '.setcast-render-'));
  try {
    const audio = await renderTracks(job, {
      ranges,
      dir,
      audio: options.audio,
      report: options.report,
    });
    const output = join(dir, `assembled${extname(job.outputLocation)}`);
    const onProgress = (progress: number) =>
      options.report({ stage: 'encode', progress, renderedFrames: totalFrames, totalFrames });
    onProgress(0);
    await muxChunks({ dir, ranges, fps, audio, output, onProgress });
    await rename(output, job.outputLocation);
    onProgress(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function renderTracks(
  job: VideoJob,
  {
    ranges,
    dir,
    audio,
    report,
  }: { ranges: FrameRange[]; dir: string; audio: string | null; report: Report },
): Promise<string | null> {
  const controller = new AbortController();
  const output = audio ? join(dir, 'master.mp4') : null;
  const { fps } = job.composition;
  const tasks = [renderChunks(job, ranges, dir, { report, signal: controller.signal })];
  if (audio && output)
    tasks.push(
      encodeMasterAudio({
        audio,
        output,
        start: ranges[0]![0] / fps,
        duration: (ranges.at(-1)![1] - ranges[0]![0] + 1) / fps,
        signal: controller.signal,
      }),
    );
  try {
    await Promise.all(tasks);
  } catch (cause) {
    controller.abort(cause);
    await Promise.allSettled(tasks);
    throw cause;
  }
  return output;
}

async function renderChunks(
  job: VideoJob,
  ranges: FrameRange[],
  dir: string,
  { report, signal }: { report: Report; signal: AbortSignal },
) {
  const totalFrames = ranges.at(-1)![1] - ranges[0]![0] + 1;
  const inputProps = { ...job.inputProps, renderAudio: false };
  // Remotion uses resolved composition props when rendering, independently of inputProps.
  const composition = {
    ...job.composition,
    props: { ...job.composition.props, renderAudio: false },
  };
  const reportFrames = (index: number, renderedFrames: number) => {
    const rendered = ranges[index]![0] - ranges[0]![0] + renderedFrames;
    report({
      stage: 'frames',
      progress: rendered / totalFrames,
      renderedFrames: rendered,
      totalFrames,
    });
  };
  const jobs = ranges.map((frameRange, index) => ({
    ...job,
    composition,
    inputProps,
    frameRange,
    muted: true,
    outputLocation: join(dir, `chunk-${index}.mp4`),
  }));
  for (const [index, chunk] of jobs.entries()) {
    let parallelEncoding = true;
    await renderCancellable(
      {
        ...chunk,
        onStart: (info) => {
          parallelEncoding = info.parallelEncoding;
          job.onStart?.(info);
        },
        onProgress: ({ renderedFrames }) => reportFrames(index, renderedFrames),
      },
      signal,
    );
    // Keep Remotion's faster streaming path when it is available. If its memory
    // check chose serial encoding, overlap the remaining batches without forcing it.
    if (!parallelEncoding && canPipeline(job) && jobs.length - index > 2) {
      await renderChunkPipeline(jobs.slice(index + 1), signal, (offset, frames) =>
        reportFrames(index + 1 + offset, frames),
      );
      return;
    }
  }
}

async function renderCancellable(job: VideoJob, signal: AbortSignal) {
  signal.throwIfAborted();
  const { cancel, cancelSignal } = makeCancelSignal();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    await renderMedia({ ...job, cancelSignal });
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}

function mediaProgress(totalFrames: number, report: Report): RenderMediaOnProgress {
  return ({ renderedFrames, encodedFrames, stitchStage }) => {
    if (renderedFrames < totalFrames) {
      report({
        stage: 'frames',
        progress: renderedFrames / totalFrames,
        renderedFrames,
        totalFrames,
      });
      return;
    }
    const encoded = stitchStage === 'muxing' ? totalFrames : encodedFrames;
    report({ stage: 'encode', progress: encoded / totalFrames, renderedFrames, totalFrames });
  };
}

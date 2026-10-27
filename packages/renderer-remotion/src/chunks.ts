import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import {
  renderMedia,
  makeCancelSignal,
  type RenderMediaOptions,
  type RenderMediaOnProgress,
} from '@remotion/renderer';
import { splitFrameRange, type FrameRange } from '@setcast/core';
export { splitFrameRange, resolveChunkSeconds } from '@setcast/core';
import type { RenderProgress } from './index.ts';
import { encodeMasterAudio, muxChunks } from './mux.ts';
import { cancellable } from './cancellation.ts';
import { canPipeline, renderChunkPipeline, type ChunkJob } from './chunk-pipeline.ts';

type VideoJob = RenderMediaOptions & { outputLocation: string };
type Report = (progress: RenderProgress) => void;
interface ChunkOptions {
  frameRange: FrameRange;
  chunkSeconds: number;
  audio: string | null;
  report: Report;
  signal?: AbortSignal;
}

export async function renderVideo(job: VideoJob, options: ChunkOptions): Promise<void> {
  options.signal?.throwIfAborted();
  const { fps } = job.composition;
  const ranges = splitFrameRange(options.frameRange, options.chunkSeconds * fps);
  const totalFrames = options.frameRange[1] - options.frameRange[0] + 1;
  if (ranges.length === 1 && !options.audio) {
    await cancellable(options.signal, (cancelSignal) =>
      renderMedia({
        ...job,
        cancelSignal,
        frameRange: options.frameRange,
        onProgress: mediaProgress(totalFrames, options.report),
      }),
    );
    return;
  }
  // Encode the master once for every audible export, including a single batch. The browser
  // audio path delays the encoded pulses; the file encoder preserves the source clock.
  // Keep the destination intact on failure, and rename atomically on its own filesystem.
  await mkdir(dirname(job.outputLocation), { recursive: true });
  const dir = await mkdtemp(join(dirname(job.outputLocation), '.setcast-render-'));
  try {
    const audio = await renderTracks(job, {
      ranges,
      dir,
      audio: options.audio,
      report: options.report,
      signal: options.signal,
    });
    const output = join(dir, `assembled${extname(job.outputLocation)}`);
    const onProgress = (progress: number) =>
      options.report({ stage: 'encode', progress, renderedFrames: totalFrames, totalFrames });
    onProgress(0);
    await muxChunks({ dir, ranges, fps, audio, output, onProgress, signal: options.signal });
    options.signal?.throwIfAborted();
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
    signal: externalSignal,
  }: {
    ranges: FrameRange[];
    dir: string;
    audio: string | null;
    report: Report;
    signal?: AbortSignal;
  },
): Promise<string | null> {
  const controller = new AbortController();
  const signal = externalSignal
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;
  const output = audio ? join(dir, 'master.mp4') : null;
  const { fps } = job.composition;
  const tasks = [renderChunks(job, ranges, dir, { report, signal })];
  if (audio && output)
    tasks.push(
      encodeMasterAudio({
        audio,
        output,
        start: ranges[0]![0] / fps,
        duration: (ranges.at(-1)![1] - ranges[0]![0] + 1) / fps,
        signal,
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
  const reportFrames = (index: number, renderedFrames: number) => {
    const rendered = ranges[index]![0] - ranges[0]![0] + renderedFrames;
    report({
      stage: 'frames',
      progress: rendered / totalFrames,
      renderedFrames: rendered,
      totalFrames,
    });
  };
  const chunks = chunkJobs(job, ranges, dir);
  for (const [index, chunk] of chunks.entries()) {
    const encoding = await renderChunk(
      chunk,
      (renderedFrames) => reportFrames(index, renderedFrames),
      signal,
    );
    const remaining = chunks.slice(index + 1);
    if (shouldPipeline(job, encoding, remaining.length)) {
      await renderChunkPipeline(remaining, signal, (offset, frames) =>
        reportFrames(index + 1 + offset, frames),
      );
      return;
    }
  }
}

/** One silent video job per range. */
function chunkJobs(job: VideoJob, ranges: FrameRange[], dir: string): ChunkJob[] {
  const inputProps = { ...job.inputProps, renderAudio: false };
  // Remotion uses resolved composition props when rendering, independently of inputProps.
  const composition = {
    ...job.composition,
    props: { ...job.composition.props, renderAudio: false },
  };
  return ranges.map((frameRange, index) => ({
    ...job,
    composition,
    inputProps,
    frameRange,
    muted: true,
    outputLocation: join(dir, `chunk-${index}.mp4`),
  }));
}

/** Renders one chunk and returns whether Remotion encoded it while capturing. */
async function renderChunk(
  chunk: VideoJob,
  reportFrames: (renderedFrames: number) => void,
  signal: AbortSignal,
): Promise<{ parallelEncoding: boolean }> {
  let parallelEncoding = true;
  await renderCancellable(
    {
      ...chunk,
      onStart: (info) => {
        parallelEncoding = info.parallelEncoding;
        chunk.onStart?.(info);
      },
      onProgress: ({ renderedFrames }) => reportFrames(renderedFrames),
    },
    signal,
  );
  return { parallelEncoding };
}

/**
 * Keep Remotion's faster streaming path when it is available. If its memory check chose serial
 * encoding, overlap capture and encoding of the remaining chunks ourselves, when at least two
 * remain and the job's settings allow it.
 */
const shouldPipeline = (
  job: VideoJob,
  encoding: { parallelEncoding: boolean },
  remaining: number,
) => !encoding.parallelEncoding && canPipeline(job) && remaining >= 2;

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

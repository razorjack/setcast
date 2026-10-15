import { mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { makeCancelSignal, renderFrames, type RenderMediaOptions } from '@remotion/renderer';
import { runFfmpeg } from './ffmpeg.ts';

export type ChunkJob = RenderMediaOptions & {
  outputLocation: string;
  frameRange: [number, number];
};

export function canPipeline(job: RenderMediaOptions): boolean {
  return [
    !job.disallowParallelEncoding,
    job.codec === 'h264',
    (job.hardwareAcceleration ?? 'disable') === 'disable',
    (job.colorSpace ?? 'default') === 'default',
    (job.pixelFormat ?? 'yuv420p') === 'yuv420p',
    (job.imageFormat ?? 'jpeg') === 'jpeg',
    (job.scale ?? 1) === 1,
    (job.everyNthFrame ?? 1) === 1,
    !job.encodingMaxRate,
    !job.encodingBufferSize,
    !job.gopSize,
    job.composition.width % 2 === 0,
    job.composition.height % 2 === 0,
  ].every(Boolean);
}

type CapturedChunk = {
  directory: string;
  imageSequence: string;
  firstFrame: number;
};

/** At most one capture and one encoder run, retaining at most two JPEG sequences. */
export async function renderChunkPipeline(
  jobs: ChunkJob[],
  parentSignal: AbortSignal,
  onFrames: (index: number, frames: number) => void,
): Promise<void> {
  const controller = new AbortController();
  const signal = AbortSignal.any([parentSignal, controller.signal]);
  let encoding: Promise<void> = Promise.resolve();
  let capture: Promise<CapturedChunk> | undefined;
  try {
    for (const [index, job] of jobs.entries()) {
      signal.throwIfAborted();
      capture = captureChunk(job, index, signal, (frames) => onFrames(index, frames));
      const [chunk] = await Promise.all([capture, encoding]);
      capture = undefined;
      encoding = encodeChunk(job, chunk, signal).finally(() =>
        rm(chunk.directory, { recursive: true, force: true }),
      );
    }
    await encoding;
  } catch (cause) {
    controller.abort(cause);
    await Promise.allSettled([capture, encoding]);
    throw cause;
  }
}

async function captureChunk(
  job: ChunkJob,
  index: number,
  signal: AbortSignal,
  onFrames: (frames: number) => void,
): Promise<CapturedChunk> {
  const directory = join(dirname(job.outputLocation), `frames-${index}`);
  await mkdir(directory);
  signal.throwIfAborted();
  const { cancel, cancelSignal } = makeCancelSignal();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    onFrames(0);
    const { assetsInfo } = await renderFrames({
      ...job,
      inputProps: job.inputProps ?? {},
      outputDir: directory,
      imageFormat: 'jpeg',
      onStart: job.onStart ?? (() => {}),
      onFrameUpdate: onFrames,
      cancelSignal,
    });
    return {
      directory,
      imageSequence: assetsInfo.imageSequenceName,
      firstFrame: assetsInfo.firstFrameIndex,
    };
  } catch (cause) {
    // renderFrames can reject before its other pages stop. Cancel before removing
    // the listener, so those pages do not mistake cleanup for a browser crash.
    cancel();
    throw cause;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}

async function encodeChunk(job: ChunkJob, chunk: CapturedChunk, signal: AbortSignal) {
  const { fps, width, height } = job.composition;
  const frames = job.frameRange[1] - job.frameRange[0] + 1;
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-r',
    String(fps),
    '-f',
    'image2',
    '-s',
    `${width}x${height}`,
    '-start_number',
    String(chunk.firstFrame),
    '-i',
    chunk.imageSequence,
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    job.x264Preset ?? 'medium',
    '-video_track_timescale',
    '90000',
  ];
  if (job.videoBitrate) args.push('-b:v', job.videoBitrate);
  else args.push('-crf', String(job.crf ?? 18));
  args.push(
    '-frames:v',
    String(frames),
    '-movflags',
    'faststart',
    '-map_metadata',
    '-1',
    job.outputLocation,
  );
  const command = job.ffmpegOverride?.({ type: 'stitcher', args }) ?? args;
  await runFfmpeg(command, {
    description: `encode video chunk ${job.outputLocation}`,
    duration: frames / fps,
    signal,
  });
}

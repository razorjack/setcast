import { writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import {
  OutputSchema,
  SetcastError,
  type OutputConfig,
  type ResolvedProject,
  type RenderOptions,
} from '@setcast/core';
import { runFfmpeg } from './ffmpeg.ts';
import { hardwareArgs, type VideoEncoder } from './hardware.ts';
import { SCREENSHOT_COLOR_FILTER } from './color.ts';

export function exportEncoding(options: RenderOptions) {
  const {
    profile,
    parallelEncoding,
    jpegQuality,
    x264Preset,
    crf,
    hardwareAcceleration,
    videoBitrate,
    chunkSeconds,
  } = options;
  if (parallelEncoding === false)
    throw new SetcastError(
      'Browser export requires parallelEncoding: true.',
      'Enable streaming encoding, or select --renderer remotion.',
    );
  const concurrency = options.concurrency ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8)
    throw new SetcastError(
      'Browser export concurrency must be an integer from 1 to 8.',
      'Use --concurrency 1 for the smallest memory footprint.',
    );
  const encoding = OutputSchema.parse({
    profile,
    parallelEncoding,
    jpegQuality,
    x264Preset,
    crf,
    hardwareAcceleration,
    videoBitrate,
    chunkSeconds,
  });
  return encoding;
}

export function videoArgs(
  fps: number,
  encoding: OutputConfig,
  out: string,
  encoder: VideoEncoder = 'libx264',
) {
  const quality = encoding.videoBitrate
    ? ['-b:v', encoding.videoBitrate]
    : ['-crf', String(encoding.crf)];
  return [
    '-f',
    'image2pipe',
    '-vcodec',
    'mjpeg',
    '-framerate',
    String(fps),
    '-i',
    'pipe:0',
    '-an',
    '-c:v',
    encoder,
    ...(encoder === 'libx264'
      ? ['-preset', encoding.x264Preset ?? 'medium']
      : hardwareArgs(encoder)),
    ...quality,
    '-vf',
    SCREENSHOT_COLOR_FILTER,
    '-pix_fmt',
    'yuv420p',
    '-video_track_timescale',
    '90000',
    out,
  ];
}

interface Assembly {
  directory: string;
  output: string;
  ranges: [number, number][];
  duration: number;
}

export async function assemble(project: ResolvedProject, options: RenderOptions, job: Assembly) {
  const audio = join(job.directory, 'master.mp4');
  const manifest = join(job.directory, 'chunks.txt');
  await writeFile(
    manifest,
    job.ranges
      .map(
        ([first, last], index) =>
          `file chunk-${index}.mp4\nduration ${(last - first + 1) / project.fps}\n`,
      )
      .join(''),
  );
  const timescale =
    extname(job.output).toLowerCase() === '.mkv'
      ? []
      : ['-movflags', '+faststart', '-video_track_timescale', '90000', '-movie_timescale', '90000'];
  await runFfmpeg(
    [
      '-f',
      'concat',
      '-safe',
      '1',
      '-i',
      manifest,
      '-i',
      audio,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0',
      '-c',
      'copy',
      ...timescale,
      '-t',
      String(job.duration),
      '-map_metadata',
      '-1',
      job.output,
    ],
    options.signal,
  );
}

export async function encodeAudio(
  project: ResolvedProject,
  options: RenderOptions,
  job: Pick<Assembly, 'directory' | 'ranges' | 'duration'>,
) {
  await runFfmpeg(
    [
      '-ss',
      String(job.ranges[0]![0] / project.fps),
      '-i',
      resolve(options.projectDir, project.audio),
      '-map',
      '0:a:0',
      '-c:a',
      'aac',
      '-b:a',
      '320k',
      '-ar',
      '48000',
      '-ac',
      '2',
      '-af',
      'apad',
      '-t',
      String(job.duration),
      '-movie_timescale',
      '90000',
      '-map_metadata',
      '-1',
      join(job.directory, 'master.mp4'),
    ],
    options.signal,
  );
}

export function preflight(signal?: AbortSignal) {
  return runFfmpeg(
    [
      '-f',
      'lavfi',
      '-i',
      'color=s=16x16',
      '-frames:v',
      '1',
      '-vf',
      SCREENSHOT_COLOR_FILTER,
      '-c:v',
      'libx264',
      '-f',
      'null',
      '-',
    ],
    signal,
  );
}

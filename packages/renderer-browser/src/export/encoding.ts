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
import { SCREENSHOT_COLOR_FILTER, PRORES_COLOR_FILTER } from './color.ts';

export type ExportVideoEncoder = VideoEncoder | 'prores_ks';
export const chunkExtension = (codec: RenderOptions['codec']) =>
  codec === 'prores-4444' ? 'mov' : 'mp4';

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
    codec: options.codec,
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
  encoder: ExportVideoEncoder = 'libx264',
) {
  if (encoding.codec === 'prores-4444') return proresVideoArgs(fps, out);
  if (encoder === 'prores_ks') throw new Error('H.264 videoArgs requires an H.264 encoder.');
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
  const extension = chunkExtension(options.codec);
  const audio = join(job.directory, `master.${extension}`);
  const manifest = join(job.directory, 'chunks.txt');
  await writeFile(
    manifest,
    job.ranges
      .map(
        ([first, last], index) =>
          `file chunk-${index}.${extension}\nduration ${(last - first + 1) / project.fps}\n`,
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
  const audioEncoding =
    options.codec === 'prores-4444' ? ['-c:a', 'pcm_s24le'] : ['-c:a', 'aac', '-b:a', '320k'];
  await runFfmpeg(
    [
      '-ss',
      String(job.ranges[0]![0] / project.fps),
      '-i',
      resolve(options.projectDir, project.audio),
      '-map',
      '0:a:0',
      ...audioEncoding,
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
      join(job.directory, `master.${chunkExtension(options.codec)}`),
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

function proresVideoArgs(fps: number, out: string) {
  return [
    '-f',
    'image2pipe',
    '-vcodec',
    'png',
    '-framerate',
    String(fps),
    '-i',
    'pipe:0',
    '-an',
    '-c:v',
    'prores_ks',
    '-profile:v',
    '4444',
    '-alpha_bits',
    '16',
    '-vf',
    PRORES_COLOR_FILTER,
    '-pix_fmt',
    'yuva444p10le',
    '-video_track_timescale',
    '90000',
    out,
  ];
}

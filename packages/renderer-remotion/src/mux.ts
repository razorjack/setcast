import { writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { runFfmpeg } from './ffmpeg.ts';

interface MuxOptions {
  dir: string;
  ranges: [number, number][];
  fps: number;
  audio: string | null;
  output: string;
  onProgress: (progress: number) => void;
}

interface MasterAudioOptions {
  audio: string;
  output: string;
  start: number;
  duration: number;
  signal?: AbortSignal;
}

export async function encodeMasterAudio({
  audio,
  output,
  start,
  duration,
  signal,
}: MasterAudioOptions): Promise<void> {
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-ss',
    String(start),
    '-i',
    audio,
  ];
  args.push(
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
  );
  args.push('-t', String(duration), '-movie_timescale', '90000', '-map_metadata', '-1', output);
  await runFfmpeg(args, { description: `encode master audio from ${audio}`, duration, signal });
}

export async function muxChunks(options: MuxOptions): Promise<void> {
  const { dir, ranges, fps, audio, output, onProgress } = options;
  const duration = (ranges.at(-1)![1] - ranges[0]![0] + 1) / fps;
  const manifest = await writeChunkManifest(dir, ranges, fps);
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-f',
    'concat',
    '-safe',
    '1',
    '-i',
    manifest,
  ];
  if (audio) args.push('-i', audio);
  args.push('-map', '0:v:0', '-c:v', 'copy');
  if (audio) args.push('-map', '1:a:0', '-c:a', 'copy');
  if (extname(output).toLowerCase() !== '.mkv')
    args.push(
      '-movflags',
      '+faststart',
      '-video_track_timescale',
      '90000',
      '-movie_timescale',
      '90000',
    );
  args.push(
    '-t',
    String(duration),
    '-map_metadata',
    '-1',
    '-progress',
    'pipe:1',
    '-nostats',
    output,
  );
  await runFfmpeg(args, {
    description: `assemble rendered chunks into ${output}`,
    duration,
    onProgress,
  });
}

async function writeChunkManifest(dir: string, ranges: [number, number][], fps: number) {
  const list = ranges
    .map(
      ([first, last], index) => `file chunk-${index}.mp4\nduration ${(last - first + 1) / fps}\n`,
    )
    .join('');
  const manifest = join(dir, 'chunks.txt');
  await writeFile(manifest, list);
  return manifest;
}

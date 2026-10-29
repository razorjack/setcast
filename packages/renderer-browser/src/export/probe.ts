import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SetcastError } from '@setcast/core';

const execute = promisify(execFile);
async function command(binary: string, args: string[], signal?: AbortSignal) {
  try {
    return (await execute(binary, args, { signal, timeout: 60_000, maxBuffer: 1024 * 1024 }))
      .stdout;
  } catch (cause) {
    signal?.throwIfAborted();
    throw new SetcastError(
      `Cannot validate stored render chunks with ${binary}.`,
      `Ensure ffmpeg and ffprobe are on PATH and support the encoded media. ${String(cause)}`,
      { cause },
    );
  }
}

export async function encoderVersion(signal?: AbortSignal) {
  return {
    ffmpeg: await command('ffmpeg', ['-version'], signal),
    ffprobe: await command('ffprobe', ['-version'], signal),
  };
}

export async function validateChunk(
  file: string,
  expected: { width: number; height: number; fps: number; frames: number },
  signal?: AbortSignal,
) {
  const text = await command(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=codec_name,codec_type,width,height,nb_frames,avg_frame_rate',
      '-of',
      'json',
      file,
    ],
    signal,
  );
  const streams = JSON.parse(text).streams;
  const stream = streams?.[0];
  const [numerator, denominator] = String(stream?.avg_frame_rate).split('/').map(Number);
  if (
    streams?.length !== 1 ||
    stream.codec_type !== 'video' ||
    stream.codec_name !== 'h264' ||
    stream.width !== expected.width ||
    stream.height !== expected.height ||
    Number(stream.nb_frames) !== expected.frames ||
    numerator! / denominator! !== expected.fps
  )
    throw new SetcastError(
      `Incomplete or incompatible render chunk: ${file}.`,
      'The chunk was not stored. Rerun the export to render it again.',
    );
}

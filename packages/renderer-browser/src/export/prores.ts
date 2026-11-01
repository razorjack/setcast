import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SetcastError } from '@setcast/core';
import { diagnosticCommand } from '@setcast/core/node';
import { exportEncoding, videoArgs } from './encoding.ts';

// Straight RGBA PNG: four orange stripes with alpha 0, 64, 128 and 255.
const fixture = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAIklEQVR4nGN4kKDAgIYd0HADGv6PjNE1jxowasCoAUPWAACHSM/Q9MQ9SgAAAABJRU5ErkJggg==',
  'base64',
);

export async function probeProres(options: { signal?: AbortSignal; timeoutMs?: number } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'setcast-prores-'));
  try {
    await verifyProres(directory, options);
  } catch (cause) {
    options.signal?.throwIfAborted();
    throw new SetcastError(
      'FFmpeg could not encode and decode ProRes 4444 with alpha and PCM audio.',
      'Install FFmpeg with PNG, prores_ks, ProRes decoding, PCM and MOV support, or use codec: h264 without transparency.',
      { cause, exitCode: 1 },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function verifyProres(
  directory: string,
  options: { signal?: AbortSignal; timeoutMs?: number },
) {
  const png = join(directory, 'frames.png');
  const movie = join(directory, 'probe.mov');
  const decoded = join(directory, 'decoded.rgba');
  await writeFile(png, Buffer.concat([fixture, fixture, fixture]));
  const encoding = exportEncoding({ codec: 'prores-4444', projectDir: directory, out: movie });
  const args = videoArgs(30, encoding, movie);
  args[args.indexOf('pipe:0')] = png;
  const videoOnly = args.indexOf('-an');
  args.splice(videoOnly, 1, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  args.splice(-1, 0, '-c:a', 'pcm_s24le', '-t', '0.1');
  const quiet = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
  await diagnosticCommand('ffmpeg', [...quiet, ...args], options);
  await diagnosticCommand(
    'ffmpeg',
    [...quiet, '-i', movie, '-map', '0:v:0', '-pix_fmt', 'rgba', '-f', 'rawvideo', decoded],
    options,
  );
  const pixels = await readFile(decoded);
  if (pixels.length !== 16 * 16 * 4 * 3)
    throw new Error('ProRes probe decoded an incorrect frame count.');
  for (let frame = 0; frame < 3; frame++) {
    for (const [stripe, alpha] of [0, 64, 128, 255].entries()) {
      const offset = (frame * 256 + 8 * 16 + stripe * 4 + 2) * 4;
      if (Math.abs(pixels[offset + 3]! - alpha) > 1)
        throw new Error(`ProRes probe alpha ${pixels[offset + 3]} differs from ${alpha}.`);
      if (
        alpha &&
        [224, 96, 32].some((channel, index) => Math.abs(pixels[offset + index]! - channel) > 4)
      )
        throw new Error('ProRes probe changed straight RGB channels.');
    }
  }
  await diagnosticCommand(
    'ffmpeg',
    [...quiet, '-i', movie, '-map', '0:a:0', '-f', 'null', '-'],
    options,
  );
}

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { Pcm } from '../audio.ts';
import { SetcastError } from '../errors.ts';

/** Analysis rate. 22.05 kHz holds everything section and beat detection look at, at half the work. */
export const ANALYSIS_RATE = 22050;

/**
 * Decodes `file` to mono samples at `rate`. ffmpeg does the work when it is on PATH, which covers
 * every format and streams rather than holding the encoded file in memory; without it, PCM WAV
 * is still read directly, so a freshly scaffolded project works out of the box.
 */
export async function decodeMono(file: string, rate = ANALYSIS_RATE): Promise<Pcm> {
  const samples = (await ffmpegPcm(file, rate)) ?? (await readWav(file, rate));
  if (!samples) {
    throw new SetcastError(
      `Cannot decode ${basename(file)}`,
      'Install ffmpeg so Setcast can read this format (brew install ffmpeg). Without ffmpeg only PCM WAV (16/24/32-bit or float) works.',
    );
  }
  return { samples, sampleRate: rate };
}

/** Null when ffmpeg is not installed. Anything else it reports is an error worth showing. */
function ffmpegPcm(file: string, rate: number): Promise<Float32Array | null> {
  const args = ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(rate), '-'];
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);
    const samples = new Samples();
    let stderr = '';
    ffmpeg.stdout.on('data', (chunk: Buffer) => samples.push(chunk));
    ffmpeg.stderr.on('data', (chunk: Buffer) => (stderr += chunk));
    ffmpeg.on('error', (error: NodeJS.ErrnoException) =>
      error.code === 'ENOENT' ? resolve(null) : reject(error),
    );
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new SetcastError(
            `ffmpeg could not read ${basename(file)}`,
            stderr.trim().split('\n')[0] ?? 'It exited without a message.',
          ),
        );
      }
      resolve(samples.done());
    });
  });
}

/**
 * Collects streamed f32le bytes into one growing Float32Array. A two-hour set is 600 MB of
 * samples, so the bytes go straight into their final buffer instead of a list of chunks that
 * is concatenated afterwards.
 */
class Samples {
  #floats = new Float32Array(1 << 20);
  #length = 0;
  #carry = Buffer.alloc(0);

  push(chunk: Buffer): void {
    const bytes = this.#carry.length ? Buffer.concat([this.#carry, chunk]) : chunk;
    const whole = bytes.length & ~3;
    this.#carry = Buffer.from(bytes.subarray(whole));
    const count = whole / 4;
    while (this.#length + count > this.#floats.length) {
      const bigger = new Float32Array(this.#floats.length * 2);
      bigger.set(this.#floats);
      this.#floats = bigger;
    }
    new Uint8Array(this.#floats.buffer).set(bytes.subarray(0, whole), this.#length * 4);
    this.#length += count;
  }

  done(): Float32Array {
    return this.#floats.subarray(0, this.#length);
  }
}

const PCM = 1;
const FLOAT = 3;
const EXTENSIBLE = 0xfffe;

/** Null when `file` is not a RIFF/WAVE holding integer or float PCM. */
export async function readWav(file: string, rate: number): Promise<Float32Array | null> {
  const buffer = await readFile(file);
  const tag = (at: number) => buffer.toString('latin1', at, at + 4);
  if (buffer.length < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let data: Buffer | undefined;
  for (let at = 12; at + 8 <= buffer.length;) {
    const size = buffer.readUInt32LE(at + 4);
    const body = buffer.subarray(at + 8, Math.min(buffer.length, at + 8 + size));
    if (tag(at) === 'fmt ' && body.length >= 16) {
      format = body.readUInt16LE(0);
      channels = body.readUInt16LE(2);
      sampleRate = body.readUInt32LE(4);
      bits = body.readUInt16LE(14);
      // Extensible headers carry the real format as the first two bytes of a GUID.
      if (format === EXTENSIBLE && body.length >= 26) format = body.readUInt16LE(24);
    } else if (tag(at) === 'data') data = body;
    at += 8 + size + (size % 2);
  }
  const read = data && channels && sampleRate ? sampleReader(format, bits) : null;
  if (!read) return null;
  return resample(toMono(data!, channels, bits / 8, read), sampleRate, rate);
}

type SampleReader = (data: Buffer, at: number) => number;

/** How to read one sample as -1..1, or null for a format this reader does not know. */
function sampleReader(format: number, bits: number): SampleReader | null {
  if (format === FLOAT && bits === 32) return (d, at) => d.readFloatLE(at);
  if (format !== PCM) return null;
  if (bits === 16) return (d, at) => d.readInt16LE(at) / 0x8000;
  if (bits === 24) return (d, at) => d.readIntLE(at, 3) / 0x800000;
  if (bits === 32) return (d, at) => d.readInt32LE(at) / 0x80000000;
  return null;
}

function toMono(data: Buffer, channels: number, bytes: number, read: SampleReader): Float32Array {
  const frames = Math.floor(data.length / (bytes * channels));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += read(data, (i * channels + c) * bytes);
    mono[i] = sum / channels;
  }
  return mono;
}

function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const at = Math.floor(pos);
    const t = pos - at;
    out[i] = (samples[at] ?? 0) * (1 - t) + (samples[at + 1] ?? samples[at] ?? 0) * t;
  }
  return out;
}

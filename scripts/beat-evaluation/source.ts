import { spawn } from 'node:child_process';
import type { EvaluationCase } from './config.ts';
import { EVALUATION_RATE } from './onsets.ts';
import { syntheticSample } from './synthetic.ts';

export async function* readSource(
  entry: EvaluationCase,
  signal?: AbortSignal,
): AsyncGenerator<Float32Array> {
  signal?.throwIfAborted();
  if ('file' in entry.source) {
    yield* decodedSource(entry, signal);
    return;
  }
  const first = Math.round(entry.at * EVALUATION_RATE);
  const count = Math.round(entry.seconds * EVALUATION_RATE);
  for (let start = 0; start < count; start += EVALUATION_RATE) {
    signal?.throwIfAborted();
    const samples = new Float32Array(Math.min(EVALUATION_RATE, count - start) * 2);
    for (let index = 0; index < samples.length; index += 2) {
      const value = syntheticSample(entry.source, first + start + index / 2);
      samples[index] = value;
      samples[index + 1] = value;
    }
    yield samples;
  }
}

async function* decodedSource(
  entry: EvaluationCase,
  signal?: AbortSignal,
): AsyncGenerator<Float32Array> {
  if (!('file' in entry.source)) throw new Error('Expected a file source.');
  const child = spawn(
    'ffmpeg',
    [
      '-v',
      'error',
      '-ss',
      String(entry.at),
      '-i',
      entry.source.file,
      '-t',
      String(entry.seconds),
      '-f',
      'f32le',
      '-ac',
      '2',
      '-ar',
      String(EVALUATION_RATE),
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], signal },
  );
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-8192);
  });
  const exited = new Promise<{ code?: number | null; error?: Error }>((resolve) => {
    child.on('error', (error) => resolve({ error }));
    child.on('close', (code) => resolve({ code }));
  });
  const reader = new StereoPcmBytes();
  try {
    for await (const chunk of child.stdout) yield reader.push(chunk as Buffer);
    const result = await exited;
    if (result.error) throw result.error;
    if (result.code !== 0) throw new Error(`ffmpeg exited ${result.code}: ${stderr.trim()}`);
    reader.finish();
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM');
    await exited;
  }
}

/** Decoder pipes may split a stereo frame at any byte. Retain at most seven bytes. */
export class StereoPcmBytes {
  private carry = Buffer.alloc(0);
  push(chunk: Buffer): Float32Array {
    const bytes = this.carry.length ? Buffer.concat([this.carry, chunk]) : chunk;
    const length = bytes.length - (bytes.length % 8);
    this.carry = Buffer.from(bytes.subarray(length));
    const result = new Float32Array(length / 4);
    for (let index = 0; index < result.length; index++)
      result[index] = bytes.readFloatLE(index * 4);
    return result;
  }
  finish() {
    if (this.carry.length) throw new Error('ffmpeg returned an incomplete stereo PCM frame.');
  }
}

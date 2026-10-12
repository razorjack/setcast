import { createInterface } from 'node:readline';
import { RenderInternals } from '@remotion/renderer';
import { SetcastError } from '@setcast/core';

interface FfmpegOptions {
  description: string;
  duration: number;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

export async function runFfmpeg(args: string[], options: FfmpegOptions): Promise<void> {
  options.signal?.throwIfAborted();
  // This wrapper supplies the bundled binary's library paths on macOS and Linux.
  const task = RenderInternals.callFf({
    bin: 'ffmpeg',
    args,
    indent: false,
    logLevel: 'error',
    binariesDirectory: null,
    cancelSignal: undefined,
    options: { buffer: false },
  });
  const cancel = () => {
    task.kill();
  };
  options.signal?.addEventListener('abort', cancel, { once: true });
  const lines = createInterface({ input: task.stdout! });
  let diagnostic = '';
  task.stderr?.on('data', (data: Buffer) => {
    diagnostic = (diagnostic + data.toString()).slice(-8192);
  });
  lines.on('line', (line) => {
    if (!line.startsWith('out_time_us=')) return;
    const seconds = Number(line.slice('out_time_us='.length)) / 1_000_000;
    if (Number.isFinite(seconds))
      options.onProgress?.(Math.max(0, Math.min(0.999, seconds / options.duration)));
  });
  try {
    await task;
  } catch (cause) {
    if (!(cause instanceof Error) || !('exitCode' in cause)) throw cause;
    throw new SetcastError(
      `Cannot ${options.description}`,
      `${diagnostic.trim()}\nCheck the audio file and available disk space, then retry. Set output.chunkSeconds: 0 to use an unchunked export.`,
      { cause, exitCode: 1 },
    );
  } finally {
    options.signal?.removeEventListener('abort', cancel);
    lines.close();
  }
}

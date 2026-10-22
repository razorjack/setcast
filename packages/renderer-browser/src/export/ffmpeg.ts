import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { SetcastError } from '@setcast/core';

type EncoderProcess = ChildProcessByStdio<Writable, null, Readable>;

export function ffmpeg(args: string[], signal?: AbortSignal) {
  signal?.throwIfAborted();
  const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], {
    stdio: ['pipe', 'ignore', 'pipe'],
  });
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const abort = () => {
    child.kill('SIGTERM');
    killTimer ??= setTimeout(() => child.kill('SIGKILL'), 2000);
  };
  signal?.addEventListener('abort', abort, { once: true });
  const done = completion(child, signal).finally(() => {
    signal?.removeEventListener('abort', abort);
    clearTimeout(killTimer);
  });
  void done.catch(() => {});
  // stdin may emit EPIPE before close reports the encoder's actual diagnostic.
  child.stdin.on('error', () => {});
  return {
    done,
    async write(frame: Buffer) {
      try {
        await new Promise<void>((resolve, reject) =>
          child.stdin.write(frame, (error) => (error ? reject(error) : resolve())),
        );
      } catch (error) {
        await done;
        throw error;
      }
    },
    async finish() {
      child.stdin.end();
      await done;
    },
    async cancel() {
      abort();
      await done.catch(() => {});
      clearTimeout(killTimer);
    },
  };
}

function completion(child: EncoderProcess, signal?: AbortSignal) {
  let diagnostic = '';
  child.stderr.on('data', (chunk: Buffer) => {
    diagnostic = (diagnostic + chunk.toString()).slice(-8192);
  });
  return new Promise<void>((resolve, reject) => {
    child.once('error', (cause) =>
      reject(
        new SetcastError(
          'Cannot start ffmpeg for browser export.',
          'Install ffmpeg on PATH, or select --renderer remotion.',
          { cause, exitCode: 1 },
        ),
      ),
    );
    child.once('close', (code) => {
      if (signal?.aborted) reject(signal.reason);
      else if (code === 0) resolve();
      else
        reject(
          new SetcastError(
            `Browser export ffmpeg exited with code ${code}.`,
            `${diagnostic.trim()}\nCheck the media, encoder support and available disk space.`,
            { exitCode: 1 },
          ),
        );
    });
  });
}

export async function runFfmpeg(args: string[], signal?: AbortSignal) {
  const job = ffmpeg(args, signal);
  await job.finish();
}

import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { hostname } from 'node:os';
import { SetcastError } from '@setcast/core';
import { digestFile, type ExportIdentity } from './identity.ts';
import { validateChunk } from './probe.ts';

interface Chunk {
  first: number;
  last: number;
  bytes: number;
  sha256: string;
}
interface Manifest {
  version: 1;
  key: string;
  chunks: Record<string, Chunk>;
}
const hashPattern = /^[a-f0-9]{64}$/;
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
export const checkpointPath = (out: string) => `${resolve(out)}.setcast-resume`;

/** A single writer owns this directory until final publication or interruption. */
export async function withCheckpoint<T>(
  out: string,
  identity: Pick<ExportIdentity, 'key'>,
  task: (checkpoint: Checkpoint) => Promise<T>,
) {
  const directory = checkpointPath(out);
  await mkdir(dirname(directory), { recursive: true });
  const created = await createDirectory(directory);
  const unlock = await lockDirectory(directory);
  let moved = false;
  try {
    const manifest = created ? emptyManifest(identity.key) : await readManifest(directory);
    const checkpoint = new Checkpoint(
      directory,
      manifest.key === identity.key ? manifest : emptyManifest(identity.key),
    );
    await checkpoint.persist();
    const result = await task(checkpoint);
    const completed = `${directory}.completed-${randomUUID()}`;
    await rename(directory, completed);
    moved = true;
    await rm(completed, { recursive: true });
    return result;
  } finally {
    if (!moved) await unlock();
  }
}

const emptyManifest = (key: string): Manifest => ({ version: 1, key, chunks: {} });
async function createDirectory(directory: string) {
  try {
    await mkdir(directory);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    if (!(await lstat(directory)).isDirectory())
      throw new SetcastError(
        `Resume directory is not a regular directory: ${directory}.`,
        'Choose another output path or remove the conflicting file/link.',
      );
    return false;
  }
}

async function lockDirectory(directory: string) {
  const file = join(directory, 'lock.json');
  let handle;
  try {
    handle = await open(file, 'wx', 0o600);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
    throw new SetcastError(
      `Resume checkpoints are locked: ${file}.`,
      'Another export may be using this output. Inspect lock.json; only remove it after confirming its process is no longer running, then retry.',
      { cause },
    );
  }
  let written = false;
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, host: hostname(), startedAt: new Date().toISOString() }),
    );
    await handle.sync();
    written = true;
  } finally {
    await handle.close();
    if (!written) await rm(file, { force: true });
  }
  return () => rm(file, { force: true });
}

async function readManifest(directory: string): Promise<Manifest> {
  const file = join(directory, 'manifest.json');
  try {
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 8 * 1024 * 1024)
        throw new Error('Manifest is not a bounded regular file.');
      return parseManifest(await handle.readFile('utf8'));
    } finally {
      await handle.close();
    }
  } catch (cause) {
    throw new SetcastError(
      `Cannot read resume manifest: ${file}.`,
      'Remove this checkpoint directory to start fresh, or render without --resume.',
      { cause },
    );
  }
}

export function parseManifest(text: string): Manifest {
  const manifest = JSON.parse(text);
  if (
    manifest?.version !== 1 ||
    typeof manifest.key !== 'string' ||
    !hashPattern.test(manifest.key) ||
    !manifest.chunks ||
    Array.isArray(manifest.chunks) ||
    typeof manifest.chunks !== 'object'
  )
    throw new Error('Invalid resume manifest header.');
  for (const [index, chunk] of Object.entries(manifest.chunks) as [string, Chunk][]) {
    if (!/^(0|[1-9]\d*)$/.test(index) || !validChunk(chunk))
      throw new Error(`Invalid resume chunk ${index}.`);
  }
  return manifest;
}

function validChunk(chunk: Chunk) {
  return (
    chunk &&
    Number.isSafeInteger(chunk.first) &&
    chunk.first >= 0 &&
    Number.isSafeInteger(chunk.last) &&
    chunk.last >= chunk.first &&
    Number.isSafeInteger(chunk.bytes) &&
    chunk.bytes > 0 &&
    typeof chunk.sha256 === 'string' &&
    hashPattern.test(chunk.sha256)
  );
}

export class Checkpoint {
  readonly directory: string;
  private manifest: Manifest;
  constructor(directory: string, manifest: Manifest) {
    this.directory = directory;
    this.manifest = manifest;
  }
  async reuse(index: number, range: [number, number], destination: string, signal?: AbortSignal) {
    const record = this.manifest.chunks[index];
    if (!record || record.first !== range[0] || record.last !== range[1]) return false;
    const source = join(this.directory, `chunk-${index}.mp4`);
    try {
      const info = await lstat(source);
      if (!info.isFile() || info.size !== record.bytes) return false;
      await copyFile(source, destination);
      const copied = await digestFile(destination, signal);
      if (copied.sha256 === record.sha256 && copied.bytes === record.bytes) return true;
    } catch (error) {
      if (!missing(error)) throw error;
    }
    await rm(destination, { force: true });
    return false;
  }
  async save(index: number, range: [number, number], source: string, signal?: AbortSignal) {
    const temporary = join(this.directory, `pending-${randomUUID()}.mp4`);
    try {
      await copyFile(source, temporary, constants.COPYFILE_EXCL);
      const { sha256, bytes } = await digestFile(temporary, signal);
      const handle = await open(temporary, 'r+');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, join(this.directory, `chunk-${index}.mp4`));
      this.manifest.chunks[index] = { first: range[0], last: range[1], bytes, sha256 };
      await this.persist();
    } finally {
      await rm(temporary, { force: true });
    }
  }
  async persist() {
    const temporary = join(this.directory, `manifest-${randomUUID()}.json`);
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify(this.manifest));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, join(this.directory, 'manifest.json'));
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

type FrameRange = [number, number];

/** Where an export's encoded chunks come from and go to, so the render loop has one path. */
export interface ChunkStore {
  /** Copies chunk `index` to `file` from an earlier identical export; false when there is none. */
  reuse(index: number, range: FrameRange, file: string, signal?: AbortSignal): Promise<boolean>;
  /** Keeps an encoded chunk for a later resumed export. */
  save(index: number, range: FrameRange, file: string, signal?: AbortSignal): Promise<void>;
  /** Throws when an input changed during the export. */
  assertInputsUnchanged(): Promise<void>;
}

/** An export without `--resume`: every chunk is encoded, nothing is kept. */
export const DISPOSABLE_CHUNKS: ChunkStore = {
  reuse: async () => false,
  save: async () => {},
  assertInputsUnchanged: async () => {},
};

/** Chunks kept in a resume checkpoint, probed before they are kept. */
export function checkpointChunks(
  checkpoint: Checkpoint,
  identity: ExportIdentity,
  video: { width: number; height: number; fps: number },
): ChunkStore {
  return {
    reuse: (index, range, file, signal) => checkpoint.reuse(index, range, file, signal),
    async save(index, range, file, signal) {
      await validateChunk(file, { ...video, frames: range[1] - range[0] + 1 }, signal);
      await checkpoint.save(index, range, file, signal);
    },
    assertInputsUnchanged: () => identity.assertInputsUnchanged(),
  };
}

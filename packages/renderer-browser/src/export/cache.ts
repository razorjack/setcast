import { constants } from 'node:fs';
import { copyFile, lstat, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SetcastError } from '@setcast/core';
import { digestFile } from './identity.ts';
import {
  absent,
  readCacheJson,
  removeCacheFiles,
  withCacheDirectory,
  writeCacheJson,
} from './cache-directory.ts';

export const DEFAULT_CACHE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ENTRIES = 4096;
const hash = /^[a-f0-9]{64}$/;
interface Entry {
  bytes: number;
  sha256: string;
  used: number;
}
interface Index {
  version: 1;
  entries: Record<string, Entry>;
}
const emptyIndex = (): Index => ({ version: 1, entries: {} });
const entryFile = (key: string) => `entry-${key}.mp4`;

function validEntry(value: Entry) {
  return (
    value &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes > 0 &&
    typeof value.sha256 === 'string' &&
    hash.test(value.sha256) &&
    Number.isSafeInteger(value.used) &&
    value.used >= 0
  );
}

export function parseCacheIndex(value: unknown): Index {
  const index = value as Index;
  if (
    index?.version !== 1 ||
    !index.entries ||
    Array.isArray(index.entries) ||
    typeof index.entries !== 'object'
  )
    throw new Error('Invalid render cache index.');
  if (Object.keys(index.entries).length > MAX_ENTRIES)
    throw new Error('Oversized render cache index.');
  for (const [key, entry] of Object.entries(index.entries))
    if (!hash.test(key) || !validEntry(entry)) throw new Error('Invalid render cache entry.');
  if (
    !Number.isSafeInteger(Object.values(index.entries).reduce((sum, entry) => sum + entry.bytes, 0))
  )
    throw new Error('Render cache byte accounting exceeds safe integers.');
  return index;
}

async function readIndex(directory: string): Promise<Index> {
  try {
    return parseCacheIndex(await readCacheJson(join(directory, 'index.json')));
  } catch (cause) {
    if (absent(cause)) return emptyIndex();
    throw new SetcastError(
      'Cannot read the render cache index.',
      'Run `setcast cache clear <directory>` to discard this cache, or use another directory.',
      { cause },
    );
  }
}

export async function withRenderCache<T>(
  path: string,
  maxBytes: number,
  task: (cache: RenderCache) => Promise<T>,
) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new RangeError('Cache size must be a positive safe integer in bytes.');
  return withCacheDirectory(path, true, async (directory) => {
    const cache = new RenderCache(directory, await readIndex(directory), maxBytes);
    await cache.reconcile();
    return task(cache);
  });
}

export class RenderCache {
  readonly directory: string;
  private index: Index;
  private maxBytes: number;
  constructor(directory: string, index: Index, maxBytes: number) {
    this.directory = directory;
    this.index = index;
    this.maxBytes = maxBytes;
  }

  private persist() {
    return writeCacheJson(this.directory, this.index);
  }

  async reconcile() {
    await removeCacheFiles(this.directory, new Set(Object.keys(this.index.entries).map(entryFile)));
    for (const [key, entry] of Object.entries(this.index.entries)) {
      try {
        const info = await lstat(join(this.directory, entryFile(key)));
        if (!info.isFile() || info.size !== entry.bytes) await this.remove(key);
      } catch (error) {
        if (!absent(error)) throw error;
        delete this.index.entries[key];
      }
    }
    await this.trim(0, MAX_ENTRIES);
    await this.persist();
  }

  async reuse(key: string, destination: string, signal?: AbortSignal) {
    if (!hash.test(key)) throw new Error('Invalid cache key.');
    signal?.throwIfAborted();
    const entry = this.index.entries[key];
    if (!entry) return false;
    try {
      const source = join(this.directory, entryFile(key));
      const info = await lstat(source);
      if (!info.isFile() || info.size !== entry.bytes) {
        await this.remove(key);
        await this.persist();
        return false;
      }
      await copyFile(source, destination, constants.COPYFILE_EXCL);
      const copied = await digestFile(destination, signal);
      if (copied.sha256 === entry.sha256 && copied.bytes === entry.bytes) {
        entry.used = Date.now();
        await this.persist();
        return true;
      }
    } catch (error) {
      if (!absent(error)) throw error;
    }
    await rm(destination, { force: true });
    await this.remove(key);
    await this.persist();
    return false;
  }

  async save(key: string, source: string, signal?: AbortSignal) {
    if (!hash.test(key)) throw new Error('Invalid cache key.');
    signal?.throwIfAborted();
    const info = await lstat(source);
    if (!info.isFile() || info.size < 1)
      throw new Error('Cache source must be a nonempty regular file.');
    if (info.size > this.maxBytes) return;
    await this.remove(key);
    await this.trim(info.size, MAX_ENTRIES - 1);
    await this.persist();
    const temporary = join(this.directory, `pending-${randomUUID()}.mp4`);
    try {
      await copyFile(source, temporary, constants.COPYFILE_EXCL);
      const copied = await digestFile(temporary, signal);
      if (copied.bytes !== info.size) throw new Error('Cache source changed while copying.');
      const handle = await open(temporary, 'r+');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      signal?.throwIfAborted();
      await rename(temporary, join(this.directory, entryFile(key)));
      this.index.entries[key] = { bytes: copied.bytes, sha256: copied.sha256, used: Date.now() };
      await this.persist();
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async remove(key: string) {
    const file = join(this.directory, entryFile(key));
    try {
      if (!(await lstat(file)).isDirectory()) await rm(file);
    } catch (error) {
      if (!absent(error)) throw error;
    }
    delete this.index.entries[key];
  }

  private async trim(reserve: number, count: number) {
    const entries = Object.entries(this.index.entries).sort(
      (a, b) => a[1].used - b[1].used || a[0].localeCompare(b[0]),
    );
    let bytes = entries.reduce((sum, [, entry]) => sum + entry.bytes, 0);
    let remaining = entries.length;
    for (const [key, entry] of entries) {
      if (bytes + reserve <= this.maxBytes && remaining <= count) break;
      await this.remove(key);
      bytes -= entry.bytes;
      remaining--;
    }
  }
}

export function inspectRenderCache(path: string) {
  return withCacheDirectory(path, false, async (directory) => {
    const index = await readIndex(directory);
    const entries = Object.entries(index.entries).map(([key, entry]) => ({ key, ...entry }));
    return {
      version: 1,
      directory,
      bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
      entries,
    };
  });
}

export function clearRenderCache(path: string) {
  return withCacheDirectory(path, false, async (directory) => {
    await writeCacheJson(directory, emptyIndex());
    await removeCacheFiles(directory, new Set());
  });
}

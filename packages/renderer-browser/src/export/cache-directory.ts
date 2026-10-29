import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { SetcastError } from '@setcast/core';

const marker = '{"format":"setcast-render-cache","version":1}\n';
export const cacheEntryName = /^entry-[a-f0-9]{64}\.mp4$/;
const temporaryName = /^pending-[a-f0-9-]{36}\.(mp4|json)$/;
export const absent = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

export async function readCacheJson(file: string, maxBytes = 2 * 1024 * 1024) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxBytes) throw new Error('Expected a bounded regular file.');
    return JSON.parse(await handle.readFile('utf8')) as unknown;
  } finally {
    await handle.close();
  }
}

export async function writeCacheJson(directory: string, value: unknown) {
  const temporary = join(directory, `pending-${randomUUID()}.json`);
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(value));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, join(directory, 'index.json'));
  } finally {
    await rm(temporary, { force: true });
  }
}

async function ensureDirectory(directory: string, create: boolean) {
  if (create) {
    await mkdir(dirname(directory), { recursive: true });
    try {
      await mkdir(directory);
      const handle = await open(join(directory, 'setcast-cache.json'), 'wx', 0o600);
      try {
        await handle.writeFile(marker);
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  if (!(await lstat(directory)).isDirectory())
    throw new Error('Cache must be a regular directory.');
  const value = await readCacheJson(join(directory, 'setcast-cache.json'), 1024);
  if (JSON.stringify(value) !== marker.trim()) throw new Error('Unrecognized render cache marker.');
}

async function lock(directory: string) {
  const file = join(directory, 'lock.json');
  let handle;
  try {
    handle = await open(file, 'wx', 0o600);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
    throw new SetcastError(
      `Render cache is locked: ${file}.`,
      'Inspect lock.json. Remove it only after confirming its process has stopped, then retry.',
      { cause },
    );
  }
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, host: hostname(), startedAt: new Date().toISOString() }),
    );
    await handle.sync();
  } catch (error) {
    await rm(file, { force: true });
    throw error;
  } finally {
    await handle.close();
  }
  return () => rm(file, { force: true });
}

export async function withCacheDirectory<T>(
  path: string,
  create: boolean,
  task: (directory: string) => Promise<T>,
) {
  const directory = resolve(path);
  try {
    await ensureDirectory(directory, create);
  } catch (cause) {
    throw new SetcastError(
      `Not a recognized render cache: ${directory}.`,
      'Use a new directory for --cache, or an existing Setcast render cache. Symbolic directory links are not accepted.',
      { cause },
    );
  }
  const unlock = await lock(directory);
  try {
    return await task(directory);
  } finally {
    await unlock();
  }
}

export async function removeCacheFiles(directory: string, retain: ReadonlySet<string>) {
  for (const name of await readdir(directory)) {
    if ((!cacheEntryName.test(name) && !temporaryName.test(name)) || retain.has(name)) continue;
    // Never recurse into an unexpected directory or follow a symbolic link during cache cleanup.
    if (!(await lstat(join(directory, name))).isDirectory()) await rm(join(directory, name));
  }
}

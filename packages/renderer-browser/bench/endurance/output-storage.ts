import { readdir, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';

export async function sampleOutputStorage(directory: string) {
  const [filesystem, entries, bytes] = await Promise.all([
    statfs(directory),
    readdir(directory),
    directoryBytes(directory),
  ]);
  return {
    bytes,
    freeBytes: filesystem.bavail * filesystem.bsize,
    temporaryDirectories: entries.filter((name) => name.startsWith('.setcast-browser-')),
    scope:
      'Apparent file bytes in this dedicated run directory, including temporary output. Free space belongs to the whole filesystem and can change due to other jobs. Symlinks are excluded.',
  };
}

async function directoryBytes(directory: string): Promise<number> {
  try {
    let bytes = 0;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) bytes += await directoryBytes(file);
      else if (entry.isFile()) bytes += await fileBytes(file);
    }
    return bytes;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

async function fileBytes(file: string) {
  try {
    return (await stat(file)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw error;
  }
}

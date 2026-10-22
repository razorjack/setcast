import { mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';

export async function atomicOutput<T>(
  out: string,
  signal: AbortSignal | undefined,
  task: (temporary: string, directory: string) => Promise<T>,
): Promise<T> {
  signal?.throwIfAborted();
  const destination = resolve(out);
  await mkdir(dirname(destination), { recursive: true });
  const directory = await mkdtemp(join(dirname(destination), '.setcast-browser-'));
  try {
    const temporary = join(directory, `output${extname(destination)}`);
    const result = await task(temporary, directory);
    signal?.throwIfAborted();
    await rename(temporary, destination);
    return result;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

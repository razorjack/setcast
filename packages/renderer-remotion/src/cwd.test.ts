import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { serializeInDirectory } from './cwd.ts';

test('serializes tasks and restores cwd after success and failure', async () => {
  const original = process.cwd();
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'setcast-cwd-')));
  const run = serializeInDirectory(dir);
  let unblock = () => {};
  const blocked = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  let secondStarted = false;

  const first = run(async () => {
    expect(process.cwd()).toBe(dir);
    await blocked;
    return 1;
  });
  const second = run(async () => {
    secondStarted = true;
    expect(process.cwd()).toBe(dir);
    return 2;
  });

  await Promise.resolve();
  expect(secondStarted).toBe(false);
  unblock();
  await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
  expect(process.cwd()).toBe(original);

  await expect(
    run(async () => {
      throw new Error('failed task');
    }),
  ).rejects.toThrow('failed task');
  expect(process.cwd()).toBe(original);
  await expect(run(async () => 3)).resolves.toBe(3);

  await rm(dir, { recursive: true });
});

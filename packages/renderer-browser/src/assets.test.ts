import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { byteRange, projectAsset } from './assets.ts';

test('media ranges support seeking, open ranges and suffixes; invalid ranges are rejected', () => {
  expect(byteRange(undefined, 100)).toEqual([0, 99]);
  expect(byteRange('bytes=20-39', 100)).toEqual([20, 39]);
  expect(byteRange('bytes=95-', 100)).toEqual([95, 99]);
  expect(byteRange('bytes=-10', 100)).toEqual([90, 99]);
  expect(byteRange('bytes=0-999', 100)).toEqual([0, 99]);
  for (const range of [
    'bytes=100-',
    'bytes=9-3',
    'bytes=-0',
    'bytes=-',
    'bytes=1-2,4-5',
    'bytes=99999999999999999999-',
  ])
    expect(byteRange(range, 100)).toBeNull();
});

test('asset paths cannot escape the project through traversal or a symlink', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'setcast-assets-')));
  const outside = await realpath(await mkdtemp(join(tmpdir(), 'setcast-outside-')));
  try {
    await writeFile(join(root, 'art.png'), 'inside');
    await writeFile(join(outside, 'secret'), 'outside');
    await symlink(outside, join(root, 'linked'));
    expect(await projectAsset(root, 'art.png')).toBe(join(root, 'art.png'));
    expect(await projectAsset(root, join(outside, 'secret'))).toBeNull();
    expect(await projectAsset(root, 'linked/secret')).toBeNull();
    expect(await projectAsset(root, '../' + outside.split('/').at(-1) + '/secret')).toBeNull();
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

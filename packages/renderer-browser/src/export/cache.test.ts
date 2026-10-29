import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test, vi } from 'vite-plus/test';
import { clearRenderCache, inspectRenderCache, parseCacheIndex, withRenderCache } from './cache.ts';
import { digest } from './identity.ts';
import { render } from './render.ts';
import type { ResolvedProject } from '@setcast/core';

const noop = async () => {};

async function fixture(task: (root: string, cache: string, source: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'setcast-cache-'));
  try {
    const source = join(root, 'source');
    await writeFile(source, 'data');
    await task(root, join(root, 'cache'), source);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('cache survives successful and failed jobs, validates content and excludes concurrent writers', async () => {
  await fixture(async (root, directory, source) => {
    const key = digest('job');
    await withRenderCache(directory, 100, async (cache) => {
      await cache.save(key, source);
      await expect(withRenderCache(directory, 100, noop)).rejects.toThrow('locked');
      await expect(clearRenderCache(directory)).rejects.toThrow('locked');
    });
    expect((await inspectRenderCache(directory)).bytes).toBe(4);
    await expect(
      withRenderCache(directory, 100, async (cache) => {
        const copy = join(root, 'copy');
        expect(await cache.reuse(key, copy)).toBe(true);
        expect(await readFile(copy, 'utf8')).toBe('data');
        expect(await cache.reuse(digest('changed-job'), join(root, 'miss'))).toBe(false);
        throw new Error('export failed');
      }),
    ).rejects.toThrow('export failed');
    await expect(readFile(join(directory, 'lock.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await writeFile(join(directory, `entry-${key}.mp4`), 'oops');
    await withRenderCache(directory, 100, async (cache) => {
      expect(await cache.reuse(key, join(root, 'corrupt'))).toBe(false);
      await expect(readFile(join(root, 'corrupt'))).rejects.toMatchObject({ code: 'ENOENT' });
    });
    expect((await inspectRenderCache(directory)).entries).toEqual([]);
  });
});

test('byte limits evict least recently used entries, shrink existing caches and skip oversized chunks', async () => {
  let now = 0;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => ++now);
  try {
    await fixture(async (root, directory, source) => {
      const [a, b, c] = ['a', 'b', 'c'].map(digest) as [string, string, string];
      await withRenderCache(directory, 8, async (cache) => {
        await cache.save(a, source);
        await cache.save(b, source);
        expect(await cache.reuse(a, join(root, 'a'))).toBe(true);
        await cache.save(c, source);
        expect(await cache.reuse(b, join(root, 'b'))).toBe(false);
      });
      expect((await inspectRenderCache(directory)).entries.map(({ key }) => key).sort()).toEqual(
        [a, c].sort(),
      );
      await withRenderCache(directory, 3, async (cache) => {
        await cache.save(a, source);
      });
      expect((await inspectRenderCache(directory)).bytes).toBe(0);
    });
  } finally {
    clock.mockRestore();
  }
});

test('cache never takes over an unrecognized directory or follows a directory/chunk symlink', async () => {
  await fixture(async (root, directory, source) => {
    await mkdir(directory);
    await writeFile(join(directory, 'keep.txt'), 'keep');
    await expect(withRenderCache(directory, 100, noop)).rejects.toThrow('recognized');
    await expect(clearRenderCache(directory)).rejects.toThrow('recognized');
    expect(await readFile(join(directory, 'keep.txt'), 'utf8')).toBe('keep');
    const actual = join(root, 'actual-cache');
    const key = digest('job');
    await withRenderCache(actual, 100, async (cache) => {
      await cache.save(key, source);
    });
    const alias = join(root, 'alias');
    await symlink(actual, alias);
    await expect(withRenderCache(alias, 100, async () => {})).rejects.toThrow('recognized');
    await rm(join(actual, `entry-${key}.mp4`));
    await symlink(source, join(actual, `entry-${key}.mp4`));
    await withRenderCache(actual, 100, async (cache) => {
      expect(await cache.reuse(key, join(root, 'copy'))).toBe(false);
    });
    expect(await readFile(source, 'utf8')).toBe('data');
  });
});

test('clear recovers corrupt indexes while preserving unrelated files and unexpected directories', async () => {
  await fixture(async (_root, directory, source) => {
    await withRenderCache(directory, 100, async (cache) => {
      await cache.save(digest('job'), source);
    });
    await writeFile(join(directory, 'keep.txt'), 'keep');
    const unexpected = join(directory, `entry-${digest('directory')}.mp4`);
    await mkdir(unexpected);
    await writeFile(join(unexpected, 'keep.txt'), 'nested');
    await writeFile(join(directory, 'index.json'), '{');
    await expect(withRenderCache(directory, 100, noop)).rejects.toThrow('index');
    await clearRenderCache(directory);
    expect((await inspectRenderCache(directory)).entries).toEqual([]);
    expect(await readFile(join(directory, 'keep.txt'), 'utf8')).toBe('keep');
    expect(await readFile(join(unexpected, 'keep.txt'), 'utf8')).toBe('nested');
  });
});

test('cancelled cache work releases its lock and incomplete atomic writes are discarded', async () => {
  await fixture(async (root, directory, source) => {
    await expect(
      withRenderCache(directory, 100, async (cache) => {
        await cache.save(digest('job'), source, AbortSignal.abort(new Error('cancelled')));
      }),
    ).rejects.toThrow('cancelled');
    const orphan = join(directory, `entry-${digest('orphan')}.mp4`);
    const pending = join(directory, 'pending-12345678-1234-1234-1234-123456789012.mp4');
    await writeFile(orphan, 'incomplete');
    await writeFile(pending, 'incomplete');
    await withRenderCache(directory, 100, async (cache) => {
      expect(await cache.reuse(digest('job'), join(root, 'copy'))).toBe(false);
    });
    for (const file of [orphan, pending, join(directory, 'lock.json')])
      await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

test('invalid sizes, traversal keys and unbounded/corrupt manifest entries fail explicitly', async () => {
  for (const maxBytes of [0, -1, Infinity, Number.MAX_SAFE_INTEGER + 1])
    await expect(withRenderCache('unused', maxBytes, async () => {})).rejects.toThrow('size');
  for (const entries of [{ '../escape': {} }, [], { [digest('key')]: { bytes: -1 } }])
    expect(() => parseCacheIndex({ version: 1, entries })).toThrow();
});

test('invalid cache export options fail before project access or browser preparation', () => {
  const options = {
    projectDir: '.',
    out: '/tmp/setcast-output.mp4',
    cache: { directory: '/tmp/setcast-cache' },
  };
  const project = {} as ResolvedProject;
  expect(() => render(project, { ...options, resume: true })).toThrow('cannot be combined');
  expect(() => render(project, { ...options, out: '/tmp/setcast-cache/export.mp4' })).toThrow(
    'outside',
  );
  expect(() => render(project, { ...options, cache: { directory: '' } })).toThrow('Invalid');
  expect(() =>
    render(project, { ...options, cache: { directory: '/tmp/setcast-cache', maxBytes: 0 } }),
  ).toThrow('Invalid');
});

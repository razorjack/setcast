import { expect, test, vi } from 'vite-plus/test';
import { PreparedCache } from './prepared.ts';

test('evicts inactive values and never disposes retained art', async () => {
  const disposed: string[] = [];
  const cache = new PreparedCache<string>('test', (value) => disposed.push(value), 1);
  const release = cache.retain('visible');
  await cache.prepare('visible', async () => 'visible');
  await cache.prepare('old', async () => 'old');
  await cache.prepare('new', async () => 'new');
  expect(disposed).toEqual(['old']);
  expect(cache.get('visible')).toBe('visible');
  release();
  expect(disposed).toEqual(['old', 'new']);
});

test('shares preparation and permits retry after failure', async () => {
  const cache = new PreparedCache<number>('test');
  const pending = cache.prepare('a', async () => {
    throw new Error('failed');
  });
  expect(cache.prepare('a', async () => 2)).toBe(pending);
  await expect(pending).rejects.toThrow('failed');
  expect(await cache.prepare('a', async () => 3)).toBe(3);
});

test('simultaneous consumers share preparation and retain until the last consumer leaves', async () => {
  const dispose = vi.fn();
  const cache = new PreparedCache<object>('test', dispose, 0);
  const releaseFirst = cache.retain('art');
  const releaseSecond = cache.retain('art');
  const art = {};
  let finish = () => {};
  const make = vi.fn(() => new Promise<object>((resolve) => (finish = () => resolve(art))));
  const first = cache.prepare('art', make);
  const second = cache.prepare('art', make);
  expect(second).toBe(first);
  await Promise.resolve();
  expect(make).toHaveBeenCalledOnce();

  releaseFirst();
  releaseFirst();
  finish();
  expect(await first).toBe(art);
  expect(await second).toBe(art);
  expect(cache.get('art')).toBe(art);
  expect(dispose).not.toHaveBeenCalled();
  expect(await cache.prepare('art', make)).toBe(art);
  expect(make).toHaveBeenCalledOnce();

  releaseSecond();
  releaseSecond();
  expect(cache.get('art')).toBeUndefined();
  expect(dispose).toHaveBeenCalledExactlyOnceWith(art);
});

test('evicts inactive values in access order and disposes each generation once', async () => {
  const disposed: string[] = [];
  const cache = new PreparedCache<string>('test', (art) => disposed.push(art), 2);
  await cache.prepare('a', async () => 'a1');
  await cache.prepare('b', async () => 'b1');
  expect(cache.get('a')).toBe('a1');
  await cache.prepare('c', async () => 'c1');
  expect(disposed).toEqual(['b1']);

  await cache.prepare('b', async () => 'b2');
  expect(cache.get('a')).toBeUndefined();
  expect(disposed).toEqual(['b1', 'a1']);
  await cache.prepare('d', async () => 'd1');
  expect(disposed).toEqual(['b1', 'a1', 'c1']);
  expect(cache.get('b')).toBe('b2');
});

test('a preparation finishing after its consumer leaves obeys the inactive capacity', async () => {
  const dispose = vi.fn();
  const cache = new PreparedCache<string>('test', dispose, 0);
  const release = cache.retain('late');
  let finish = (_art: string) => {};
  const pending = cache.prepare('late', () => new Promise((resolve) => (finish = resolve)));
  await Promise.resolve();
  release();
  expect(dispose).not.toHaveBeenCalled();
  finish('old art');
  await pending;
  expect(dispose).toHaveBeenCalledExactlyOnceWith('old art');
  expect(cache.get('late')).toBeUndefined();

  const releaseNext = cache.retain('late');
  expect(await cache.prepare('late', async () => 'new art')).toBe('new art');
  expect(cache.get('late')).toBe('new art');
  releaseNext();
  expect(dispose.mock.calls).toEqual([['old art'], ['new art']]);
});

test('a synchronous preparation failure is shared, never disposed, and can retry', async () => {
  const dispose = vi.fn();
  const cache = new PreparedCache<string>('test', dispose);
  const error = new Error('decode failed');
  const failed = cache.prepare('a', () => {
    throw error;
  });
  expect(cache.prepare('a', async () => 'unused')).toBe(failed);
  await expect(failed).rejects.toBe(error);
  expect(cache.get('a')).toBeUndefined();
  expect(dispose).not.toHaveBeenCalled();
  expect(await cache.prepare('a', async () => 'recovered')).toBe('recovered');
});

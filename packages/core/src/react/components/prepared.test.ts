import { expect, test } from 'vite-plus/test';
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

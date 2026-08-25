import { expect, test } from 'vite-plus/test';
import { clipRange } from './clip.ts';
import { parseRange, rangeName } from './render.ts';

test('rangeName stamps a slice without colons', () => {
  expect(rangeName('out/set.mp4', [30, 45])).toBe('out/set.0m30s-0m45s.mp4');
  expect(rangeName('out/set.mp4', [3600, 3723])).toBe('out/set.1h00m00s-1h02m03s.mp4');
  expect(rangeName('out/set', [30, 45])).toBe('out/set.0m30s-0m45s');
});

test('parseRange accepts timecodes and seconds, rejects nonsense', () => {
  expect(parseRange('1:00-1:30')).toEqual([60, 90]);
  expect(parseRange('60-90.5')).toEqual([60, 90.5]);
  expect(() => parseRange('1:30-1:00')).toThrow(/Invalid --range/);
  expect(() => parseRange('abc')).toThrow(/Invalid --range/);
});

test('clipRange puts the drop a third of the way in, never before the set', () => {
  expect(clipRange(64, 45)).toEqual([49, 94]);
  expect(clipRange(5, 45)).toEqual([0, 45]);
});

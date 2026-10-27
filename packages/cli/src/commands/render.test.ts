import { expect, test } from 'vite-plus/test';
import { clipFile, clipRange } from './clip.ts';
import { rangeName } from '../paths.ts';
import { parseRange } from './render.ts';

test('rangeName stamps a slice without colons', () => {
  expect(rangeName('out/set.mp4', [30, 45])).toBe('out/set.0m30s-0m45s.mp4');
  expect(rangeName('out/set.mp4', [3600, 3723])).toBe('out/set.1h00m00s-1h02m03s.mp4');
  expect(rangeName('out/set', [30, 45])).toBe('out/set.0m30s-0m45s');
  expect(rangeName('set.mp4', [60.1, 90.1])).toBe('set.1m00.1s-1m30.1s.mp4');
  expect(rangeName('set.mp4', [60.9, 90.9])).toBe('set.1m00.9s-1m30.9s.mp4');
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

test('early drops cannot overwrite clips with the same clamped range', () => {
  expect(clipFile('set.mp4', clipRange(1, 45), 1)).not.toBe(
    clipFile('set.mp4', clipRange(2, 45), 2),
  );
});

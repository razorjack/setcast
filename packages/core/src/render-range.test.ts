import { describe, expect, test } from 'vite-plus/test';
import { microseconds, normalizeMix, SetcastError, Timeline } from '@setcast/core';
import {
  framesWithinMix,
  resolveFrameRange,
  splitFrameRange,
  resolveChunkSeconds,
} from './index.ts';

test('every selected frame queries inside the finite mix after microsecond rounding', () => {
  for (const fps of [24, 25, 30, 60]) {
    for (const seconds of [0.000001, 0.066667, 1, 1.000001, 1.033333, 1.033334]) {
      const timeline = new Timeline(normalizeMix({}, seconds));
      const frames = framesWithinMix(microseconds(seconds), fps);
      expect(frames).toBeGreaterThan(0);
      expect(() => timeline.at((frames - 1) / fps)).not.toThrow();
      expect(() => timeline.at(frames / fps)).toThrow(RangeError);
    }
  }
});

test('frame counts distinguish a rounded endpoint from the microsecond just after it', () => {
  for (const [fps, endpoint, before, after] of [
    [30, 66_667, 2, 3],
    [24, 41_667, 1, 2],
    [60_000 / 1001, 16_683, 1, 2],
  ]) {
    expect(framesWithinMix(endpoint!, fps!)).toBe(before);
    expect(framesWithinMix(endpoint! + 1, fps!)).toBe(after);
    expect(framesWithinMix(endpoint! - 1, fps!)).toBe(before);
  }
});

describe('resolveFrameRange', () => {
  test('converts seconds and clips the end to the composition', () => {
    expect(resolveFrameRange([1, 2], 30, 300)).toEqual([30, 59]);
    expect(resolveFrameRange([9, 12], 30, 300)).toEqual([270, 299]);
  });

  test('rejects ranges that start after the composition', () => {
    expect(() => resolveFrameRange([10, 11], 30, 300)).toThrow(/composition ends/);
  });

  test('rejects invalid ranges with the offending values and an actionable hint', () => {
    for (const range of [
      [-1, 2],
      [1, 1],
      [2, 1],
      [NaN, 2],
      [0, Infinity],
    ] as [number, number][]) {
      expect(() => resolveFrameRange(range, 30, 300)).toThrow(
        new SetcastError(
          `Invalid render range: ${range[0]}-${range[1]}`,
          'START and END must be finite non-negative seconds, and END must be after START.',
        ),
      );
      try {
        resolveFrameRange(range, 30, 300);
      } catch (error) {
        expect(error).toMatchObject({
          hint: 'START and END must be finite non-negative seconds, and END must be after START.',
        });
      }
    }
  });

  test('rounds fractional frame ranges once and keeps subframe slices nonempty', () => {
    expect(resolveFrameRange([0.05, 0.1], 30, 300)).toEqual([2, 2]);
    expect(resolveFrameRange([0.001, 0.002], 30, 300)).toEqual([0, 0]);
    expect(resolveFrameRange([9.96, 100], 30, 300)).toEqual([299, 299]);
    expect(() => resolveFrameRange([9.99, 10], 30, 300)).toThrow(/starts at 9.99 s/);
  });
});

test.each([24, 25, 30, 50, 60])('partitions absolute ranges without gaps at %s fps', (fps) => {
  const first = 84 * fps + 1;
  const last = first + 120 * fps;
  expect(splitFrameRange([first, last], 60 * fps)).toEqual([
    [first, first + 60 * fps - 1],
    [first + 60 * fps, last - 1],
    [last, last],
  ]);
  expect(splitFrameRange([first, last], 0)).toEqual([[first, last]]);
  expect(splitFrameRange([first, first], 60 * fps)).toEqual([[first, first]]);
});

test('validates bounded chunk sizes and defaults to one minute', () => {
  expect(resolveChunkSeconds(undefined)).toBe(60);
  expect(resolveChunkSeconds(0)).toBe(0);
  for (const value of [-1, 61, 1.5, NaN, Infinity]) {
    expect(() => resolveChunkSeconds(value)).toThrow('Invalid render chunkSeconds');
  }
});

import { describe, expect, test } from 'vite-plus/test';
import { microseconds, normalizeMix, Timeline } from '@setcast/core';
import { framesWithinMix, resolveFrameRange } from './range.ts';

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

describe('resolveFrameRange', () => {
  test('converts seconds and clips the end to the composition', () => {
    expect(resolveFrameRange([1, 2], 30, 300)).toEqual([30, 59]);
    expect(resolveFrameRange([9, 12], 30, 300)).toEqual([270, 299]);
  });

  test('rejects ranges that start after the composition', () => {
    expect(() => resolveFrameRange([10, 11], 30, 300)).toThrow(/composition ends/);
  });
});

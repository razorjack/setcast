import { describe, expect, test } from 'vite-plus/test';
import { resolveFrameRange } from './range.ts';

describe('resolveFrameRange', () => {
  test('converts seconds and clips the end to the composition', () => {
    expect(resolveFrameRange([1, 2], 30, 300)).toEqual([30, 59]);
    expect(resolveFrameRange([9, 12], 30, 300)).toEqual([270, 299]);
  });

  test('rejects ranges that start after the composition', () => {
    expect(() => resolveFrameRange([10, 11], 30, 300)).toThrow(/composition ends/);
  });
});

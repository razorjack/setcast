import { expect, test } from 'vite-plus/test';
import { parseRange } from './render.ts';

test('parseRange accepts timecodes and seconds, rejects nonsense', () => {
  expect(parseRange('1:00-1:30')).toEqual([60, 90]);
  expect(parseRange('60-90.5')).toEqual([60, 90.5]);
  expect(() => parseRange('1:30-1:00')).toThrow(/Invalid --range/);
  expect(() => parseRange('abc')).toThrow(/Invalid --range/);
});

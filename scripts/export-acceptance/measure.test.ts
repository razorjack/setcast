import { expect, test } from 'vite-plus/test';
import { assertTiming, starts } from './measure.ts';

test('finds pulse entrances, including a pulse at the start, without counting its trailing edge', () => {
  expect(starts([255, 200, 0, 0, 255, 180, 0], 127)).toEqual([0, 4]);
});

test('timing assertions reject shifted, missing, extra and invalid pulses', () => {
  expect(() => assertTiming([0.434, 1.434], [0.433, 1.433], 0.005)).not.toThrow();
  for (const actual of [[0.467, 1.467], [0.433], [0.433, 1.433, 2.433], [NaN, 1.433]]) {
    expect(() => assertTiming(actual, [0.433, 1.433], 0.005)).toThrow();
  }
});

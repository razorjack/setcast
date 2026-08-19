import { describe, expect, test } from 'vite-plus/test';
import { ease, impulse, interpolate, rampUp, spring } from './motion.ts';

describe('interpolate', () => {
  test('maps linearly and clamps by default', () => {
    expect(interpolate(5, [0, 10], [0, 100])).toBe(50);
    expect(interpolate(-5, [0, 10], [0, 100])).toBe(0);
    expect(interpolate(15, [0, 10], [0, 100])).toBe(100);
    expect(interpolate(15, [0, 10], [0, 100], { extrapolate: 'extend' })).toBe(150);
  });

  test('supports multiple stops and easing', () => {
    expect(interpolate(15, [0, 10, 20], [0, 100, 0])).toBe(50);
    expect(interpolate(5, [0, 10], [0, 1], { easing: ease.in })).toBeCloseTo(0.125);
    expect(interpolate(10, [0, 10], [0, 1], { easing: ease.out })).toBe(1);
  });

  test('rejects mismatched ranges', () => {
    expect(() => interpolate(0, [0], [0])).toThrow(RangeError);
  });
});

describe('spring', () => {
  test('starts at 0, settles at 1, overshoots when underdamped', () => {
    expect(spring(0)).toBe(0);
    expect(spring(5)).toBeCloseTo(1, 3);
    const peak = Math.max(...Array.from({ length: 60 }, (_, i) => spring(i / 30)));
    expect(peak).toBeGreaterThan(1);
    expect(spring(5, { damping: 40 })).toBeCloseTo(1, 3);
  });

  test('critically and overdamped springs never overshoot', () => {
    for (const damping of [2 * Math.sqrt(120), 60]) {
      for (let i = 0; i < 90; i++) expect(spring(i / 30, { damping })).toBeLessThanOrEqual(1);
    }
  });
});

test('impulse and rampUp envelopes', () => {
  expect(impulse(-1, 1)).toBe(0);
  expect(impulse(0, 1)).toBe(1);
  expect(impulse(1, 1)).toBeLessThan(0.01);
  expect(rampUp(0, 2)).toBe(0);
  expect(rampUp(1, 2)).toBe(0.5);
  expect(rampUp(3, 2)).toBe(1);
});

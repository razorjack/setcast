import { expect, test } from 'vite-plus/test';
import { pixelDifference } from './pixel-difference.ts';

test('counts pixels once while measuring all RGBA channels', () => {
  const first = new Uint8ClampedArray([0, 0, 0, 255, 10, 20, 30, 255]);
  const second = new Uint8ClampedArray([3, 4, 0, 255, 10, 20, 30, 250]);
  expect(pixelDifference(first, second)).toEqual({
    pixels: 2,
    changed: 2,
    maximum: 5,
    mean: 1.5,
    rmse: 2.5,
  });
  expect(pixelDifference(first, first)).toEqual({
    pixels: 2,
    changed: 0,
    maximum: 0,
    mean: 0,
    rmse: 0,
  });
});

test('rejects incompatible or incomplete pixel buffers', () => {
  for (const length of [0, 3, 5])
    expect(() =>
      pixelDifference(new Uint8ClampedArray(length), new Uint8ClampedArray(length)),
    ).toThrow('RGBA');
  expect(() => pixelDifference(new Uint8ClampedArray(4), new Uint8ClampedArray(8))).toThrow(
    'equally sized',
  );
});

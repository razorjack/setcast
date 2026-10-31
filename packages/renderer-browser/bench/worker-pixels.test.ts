import { expect, test } from 'vite-plus/test';
import { pixelDifference } from './worker-pixels.ts';

test('source precision permits sparse rounding but rejects larger errors and coverage', () => {
  const reference = new Uint8Array(1920 * 1080 * 3);
  const actual = reference.slice();
  for (let pixel = 0; pixel < 21; pixel++) actual[pixel * 3] = 1;
  expect(pixelDifference(reference, actual)).toMatchObject({
    maximum: 1,
    changedPixels: 21,
    qualified: true,
  });
  actual[21 * 3] = 1;
  expect(pixelDifference(reference, actual).qualified).toBe(false);
  actual.fill(0);
  actual[0] = 2;
  expect(pixelDifference(reference, actual)).toMatchObject({
    maximum: 2,
    changedPixels: 1,
    qualified: false,
  });
  actual.fill(0);
  actual.set([1, 1, 1]);
  expect(pixelDifference(reference, actual)).toMatchObject({ changedPixels: 1, qualified: true });
  expect(() => pixelDifference(reference, actual.subarray(3))).toThrow();
});

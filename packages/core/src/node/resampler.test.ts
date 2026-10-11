import { expect, test } from 'vite-plus/test';
import { Resampler } from './resampler.ts';

const tone = (frequency: number) =>
  Float32Array.from(
    { length: 44100 },
    (_, index) => 0.5 * Math.sin((2 * Math.PI * frequency * index) / 44100),
  );
const resample = (samples: Float32Array, chunkSize: number) => {
  const reader = new Resampler(samples.length, 44100, 4000);
  const result: number[] = [];
  for (let offset = 0; offset < samples.length; offset += chunkSize)
    result.push(...reader.push(samples.subarray(offset, offset + chunkSize)));
  result.push(...reader.done());
  return result;
};
const rms = (samples: number[]) =>
  Math.sqrt(
    samples.slice(100, -100).reduce((sum, value) => sum + value ** 2, 0) / (samples.length - 200),
  );

test('preserves bass and rejects highs that would alias into bass', () => {
  expect(rms(resample(tone(50), 65536))).toBeCloseTo(0.5 / Math.SQRT2, 3);
  expect(rms(resample(tone(3950), 65536))).toBeLessThan(0.0001);
});

test('chunk boundaries cannot change resampled audio', () => {
  const samples = tone(700);
  const whole = resample(samples, samples.length);
  expect(whole).toHaveLength(4000);
  expect(resample(samples, 127)).toEqual(whole);
  expect(resample(samples, 1)).toEqual(whole);
});

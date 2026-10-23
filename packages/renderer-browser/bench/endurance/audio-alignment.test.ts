import { expect, test } from 'vite-plus/test';
import { audioAlignment } from './audio-alignment.ts';

const settings = { sampleRate: 2000, channels: 2, windowSamples: 1000, searchSamples: 100 };
function noise() {
  let state = 42;
  return Float32Array.from({ length: 2400 }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state / 2147483648) * 0.5;
  });
}

test('alignment compares stereo without cancellation and reports signed offsets', () => {
  const source = noise();
  for (let index = 0; index < source.length; index += 2) source[index + 1] = -source[index]!;
  expect(audioAlignment(source, source, settings)).toMatchObject({
    status: 'passed',
    lagSamples: 0,
    correlation: 1,
  });
  for (const lag of [-20, 20]) {
    const output = Float32Array.from(source, (_, index) => source[index - lag * 2] ?? 0);
    expect(audioAlignment(source, output, settings)).toMatchObject({
      status: 'shifted',
      lagSamples: lag,
      lagMilliseconds: lag / 2,
    });
  }
});

test('channel changes, missing sound and gain errors do not pass as aligned output', () => {
  const source = noise();
  const swapped = Float32Array.from(source, (_, index) => source[index ^ 1]!);
  expect(audioAlignment(source, swapped, settings).status).toBe('mismatch');
  expect(audioAlignment(source, new Float32Array(source.length), settings).status).toBe('mismatch');
  expect(
    audioAlignment(
      source,
      source.map((value) => value * 0.5),
      settings,
    ).status,
  ).toBe('level-mismatch');
});

test('silence and periodic signals are inconclusive, not alignment evidence', () => {
  const silence = new Float32Array(2400);
  expect(audioAlignment(silence, silence, settings).status).toBe('inconclusive-silence');
  const periodic = Float32Array.from(silence, (_, index) =>
    Math.sin((Math.floor(index / 2) * Math.PI) / 4),
  );
  expect(audioAlignment(periodic, periodic, settings).status).toBe('inconclusive-periodic');
});

test('truncated and nonfinite PCM fail explicitly', () => {
  const source = noise();
  expect(() => audioAlignment(source, source.subarray(0, 100), settings)).toThrow('incomplete');
  source[0] = NaN;
  expect(() => audioAlignment(source, source, settings)).toThrow('nonfinite');
});

test('a quieter channel cannot disappear behind a correct louder channel', () => {
  const source = noise();
  for (let index = 1; index < source.length; index += 2) source[index] = source[index]! * 0.01;
  const output = source.map((value, index) => (index % 2 ? 0 : value));
  expect(audioAlignment(source, output, settings).status).toBe('mismatch');
  expect(audioAlignment(output, output, settings).status).toBe('passed');
});

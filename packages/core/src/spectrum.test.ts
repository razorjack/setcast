import { describe, expect, test } from 'vite-plus/test';
import { FFT_SIZE, spectrum } from './spectrum.ts';

describe('spectrum', () => {
  test('preserves the amplitude and frequency of a bin-centered PCM tone', () => {
    const bin = 32;
    const amplitude = 0.375;
    const samples = Float32Array.from(
      { length: FFT_SIZE },
      (_, index) => amplitude * Math.sin((2 * Math.PI * bin * index) / FFT_SIZE),
    );
    const magnitudes = spectrum(samples, FFT_SIZE / 2);

    // Three adjacent-bin averages convolve a single tone with these coefficients.
    const weights = [1, 3, 6, 7, 6, 3, 1];
    for (let offset = -3; offset <= 3; offset++) {
      expect(magnitudes[bin + offset]).toBeCloseTo((amplitude * weights[offset + 3]!) / 27, 8);
    }
    expect(magnitudes.indexOf(Math.max(...magnitudes))).toBe(bin);
    expect(magnitudes.reduce((sum, magnitude) => sum + magnitude, 0)).toBeCloseTo(amplitude, 7);
  });

  test('an impulse has a flat spectrum at the full-scale PCM reference', () => {
    const samples = new Float32Array(FFT_SIZE);
    samples[137] = -0.5;
    for (const magnitude of spectrum(samples, FFT_SIZE / 2)) {
      expect(magnitude).toBeCloseTo(1 / FFT_SIZE, 12);
    }
  });

  test('pads the real source boundaries with silence', () => {
    const samples = new Float32Array(FFT_SIZE);
    samples[0] = 1;
    expect(spectrum(samples, 0)).toEqual(spectrum(samples, FFT_SIZE / 2));
    expect(spectrum(samples, -FFT_SIZE / 2)).toEqual(Array(FFT_SIZE / 2).fill(0));
    expect(spectrum(samples, samples.length + FFT_SIZE / 2)).toEqual(Array(FFT_SIZE / 2).fill(0));
  });
});

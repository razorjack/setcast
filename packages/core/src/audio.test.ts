import { describe, expect, test } from 'vite-plus/test';
import { bandEnergy, logBins, rms, sampleBins, soft, spectrumFeatures } from './audio.ts';

const sampleRate = 48000;
const bins = 1024;
const hz = sampleRate / 2 / bins;
const toneAt = (freq: number, level = 1) => {
  const magnitudes = new Array<number>(bins).fill(0);
  magnitudes[Math.round(freq / hz)] = level;
  return { magnitudes, sampleRate };
};

describe('spectrum features', () => {
  test('bandEnergy averages the right bins', () => {
    const bassTone = toneAt(60);
    expect(bandEnergy(bassTone, 20, 150)).toBeGreaterThan(0);
    expect(bandEnergy(bassTone, 150, 2000)).toBe(0);
  });

  test('a bass tone lights bass, a hat lights highs', () => {
    const low = spectrumFeatures(toneAt(55));
    const high = spectrumFeatures(toneAt(8000, 0.3));
    expect(low.bass).toBeGreaterThan(low.highs);
    expect(high.highs).toBeGreaterThan(high.bass);
    const firstLit = (bins: readonly number[]) => bins.findIndex((bin) => bin > 0);
    expect(firstLit(low.bins)).toBeLessThan(firstLit(high.bins));
  });

  test('logBins flatten a tilted spectrum into a roughly even picture', () => {
    const tilt = 0.7;
    const magnitudes = Array.from({ length: bins }, (_, i) =>
      i === 0 ? 0 : 0.02 / ((i * hz) / 100) ** tilt,
    );
    const flattened = logBins({ magnitudes, sampleRate }, { tilt });
    expect(flattened).toHaveLength(64);
    for (const bin of flattened) {
      expect(bin).toBeGreaterThan(0);
      expect(bin).toBeLessThanOrEqual(1);
    }

    // The edge bins run off the ends of the spectrum, so only the inner ones should be level.
    const inner = flattened.slice(4, -4);
    expect(Math.max(...inner) / Math.min(...inner)).toBeLessThan(1.5);
  });
});

test('soft and rms', () => {
  expect(soft(0)).toBe(0);
  expect(soft(100)).toBeCloseTo(1);
  expect(rms([])).toBe(0);
  expect(rms([0.5, -0.5])).toBeCloseTo(soft(0.5, 3));
});

test('sampleBins keeps the ends and interpolates between them', () => {
  const curve = [0, 1, 2, 3];
  expect(sampleBins(curve, 4)).toEqual(curve);
  expect(sampleBins(curve, 7)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3]);
  expect(sampleBins(curve, 2)).toEqual([0, 3]);
  expect(sampleBins(curve, 1)).toEqual([0]);
});

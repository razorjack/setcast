import { describe, expect, test } from 'vite-plus/test';
import {
  bandEnergy,
  historyTimes,
  logBins,
  PEAK_FALL_SECONDS,
  peakHold,
  rms,
  sampleBins,
  soft,
  spectrumFeatures,
  waveSlice,
} from './audio.ts';

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

test('waveSlice averages each share of the samples and reads past the ends as silence', () => {
  const samples = [1, 1, -1, -1, 0.5, 0.5];
  expect(waveSlice(samples, 0, 6, 3)).toEqual([1, -1, 0.5]);
  expect(waveSlice(samples, -2, 2, 2)).toEqual([0, 1]);
  expect(waveSlice(samples, 4, 8, 2)).toEqual([0.5, 0]);
});

test('historyTimes sit on a grid that the next frame shares', () => {
  const now = historyTimes(10.01, 2, 4);
  const next = historyTimes(10.51, 2, 4);
  expect(now).toEqual([8.5, 9, 9.5, 10]);
  expect(next.slice(0, 3)).toEqual(now.slice(1));
  expect(historyTimes(0.2, 2, 4)).toEqual([-1.5, -1, -0.5, 0]);
  expect(() => historyTimes(0, 30, 10)).toThrow(/HISTORY_SECONDS/);
});

describe('peakHold', () => {
  test('holds the highest level for the hold time, then falls at a steady rate', () => {
    const loud = { age: 0.5, levels: [0.9] };
    expect(peakHold([0.2], [loud], 1)).toEqual([0.9]);

    const fallen = { age: 1 + PEAK_FALL_SECONDS / 2, levels: [0.9] };
    expect(peakHold([0.2], [fallen], 1)[0]).toBeCloseTo(0.4);

    const gone = { age: 1 + PEAK_FALL_SECONDS, levels: [0.9] };
    expect(peakHold([0.2], [gone], 1)).toEqual([0.2]);
  });

  test('keeps each level to its own peak', () => {
    expect(peakHold([0.1, 0.8], [{ age: 0.2, levels: [0.6, 0.3] }], 1)).toEqual([0.6, 0.8]);
  });
});

import type { MediaUtilsAudioData } from '@remotion/media-utils';
import { describe, expect, test } from 'vite-plus/test';
import { windowedAnalyzer } from './analyzer.ts';

const audioData = (samples: number): MediaUtilsAudioData => ({
  channelWaveforms: [
    Float32Array.from({ length: samples }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / 48000)),
  ],
  sampleRate: 48000,
  durationInSeconds: samples / 48000,
  numberOfChannels: 1,
  resultId: `test-${samples}`,
  isRemote: false,
});

describe('windowedAnalyzer', () => {
  test('returns finite normalized features and caches each instant', () => {
    const analyzer = windowedAnalyzer(audioData(4096), 0, 30);
    const first = analyzer.featuresAt(0.02);
    const second = analyzer.featuresAt(0.02);

    expect(second).toBe(first);
    expect(first.bins).toHaveLength(64);
    for (const value of [
      first.bass,
      first.mids,
      first.highs,
      first.rms,
      first.onset,
      ...first.bins,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  test('a lookback past the window edge reads the edge, not the wrong moment', () => {
    const offset = 10;
    const analyzer = windowedAnalyzer(audioData(48000), offset, 30);
    // 2 s before the window starts: without clamping this returns the window's opening samples.
    expect(analyzer.featuresAt(offset - 2)).toBe(analyzer.featuresAt(offset));
    expect(analyzer.featuresAt(offset + 100)).toBe(analyzer.featuresAt(offset + 1));
  });

  test('propagates invalid analysis windows', () => {
    const analyzer = windowedAnalyzer(audioData(1024), 0, 30);
    expect(() => analyzer.featuresAt(0)).toThrow(/not big enough/);
  });
});

import { WAVE_POINTS } from '@setcast/core';
import type { MediaUtilsAudioData } from '@remotion/media-utils';
import { describe, expect, test } from 'vite-plus/test';
import { windowedAnalyzer, type ChannelWindow } from './analyzer.ts';

const audioData = (samples: number, level = 1): MediaUtilsAudioData => ({
  channelWaveforms: [
    Float32Array.from(
      { length: samples },
      (_, i) => level * Math.sin((2 * Math.PI * 440 * i) / 48000),
    ),
  ],
  sampleRate: 48000,
  durationInSeconds: samples / 48000,
  numberOfChannels: 1,
  resultId: `test-${samples}-${level}`,
  isRemote: false,
});

const stereo = (samples: number, offset = 0) => {
  const channel = (level: number): ChannelWindow => ({
    audioData: audioData(samples, level),
    dataOffsetInSeconds: offset,
  });
  return windowedAnalyzer({ left: channel(1), right: channel(0.5) }, 30);
};

describe('windowedAnalyzer', () => {
  test('returns finite normalized features and caches each instant', () => {
    const analyzer = stereo(4096);
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

  test('the waveform holds the last moment of each channel', () => {
    const { wave } = stereo(48000).featuresAt(0.5);
    expect(wave.left).toHaveLength(WAVE_POINTS);
    expect(wave.right).toHaveLength(WAVE_POINTS);
    const peak = (samples: readonly number[]) => Math.max(...samples.map(Math.abs));
    expect(peak(wave.left)).toBeCloseTo(1, 1);
    expect(peak(wave.right)).toBeCloseTo(0.5, 1);
  });

  test('a lookback past the window edge reads the edge, not the wrong moment', () => {
    const offset = 10;
    const analyzer = stereo(48000, offset);
    // 2 s before the window starts: without clamping this returns the window's opening samples.
    expect(analyzer.featuresAt(offset - 2)).toBe(analyzer.featuresAt(offset));
    expect(analyzer.featuresAt(offset + 100)).toBe(analyzer.featuresAt(offset + 1));
  });

  test('propagates invalid analysis windows', () => {
    const analyzer = stereo(1024);
    expect(() => analyzer.featuresAt(0)).toThrow(/not big enough/);
  });
});

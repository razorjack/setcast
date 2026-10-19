import { HISTORY_SECONDS, WAVE_POINTS, type AudioFeatures } from '@setcast/core';
import type { MediaUtilsAudioData } from '@remotion/media-utils';
import { describe, expect, test } from 'vite-plus/test';
import { coversLookback, windowedAnalyzer, type ChannelWindow } from './analyzer.ts';
import { FFT_SIZE } from './spectrum.ts';

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

const sampleRate = 48000;

function pcmWindow(samples: Float32Array, offset = 0, duration = samples.length / sampleRate) {
  return {
    audioData: { ...audioData(0), channelWaveforms: [samples], durationInSeconds: duration },
    dataOffsetInSeconds: offset,
  };
}

function tone(seconds: number, amplitude = 0.25): Float32Array {
  return Float32Array.from(
    { length: seconds * sampleRate },
    (_, index) => amplitude * Math.sin((2 * Math.PI * 32 * index) / FFT_SIZE),
  );
}

function materialize(features: AudioFeatures): AudioFeatures {
  return { ...features, bins: [...features.bins], wave: structuredClone(features.wave) };
}

function expectFeaturesClose(actual: AudioFeatures, expected: AudioFeatures) {
  for (const source of ['bass', 'mids', 'highs', 'rms', 'onset'] as const) {
    expect(actual[source]).toBeCloseTo(expected[source], 12);
  }
  for (let bin = 0; bin < actual.bins.length; bin++) {
    expect(actual.bins[bin]).toBeCloseTo(expected.bins[bin]!, 12);
  }
  expect(actual.wave).toEqual(expected.wave);
}

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

  test('pads short clips with silence', () => {
    expect(stereo(1024).featuresAt(0).bins.every(Number.isFinite)).toBe(true);
  });

  test('silence is finite and right-only audio contributes energy', () => {
    const channel = (level: number) => ({
      audioData: audioData(48000, level),
      dataOffsetInSeconds: 0,
    });
    const silent = channel(0);
    const signal = channel(1);
    const quiet = windowedAnalyzer({ left: silent, right: silent }, 30).featuresAt(0.5);
    expect([quiet.bass, quiet.mids, quiet.highs, quiet.rms, quiet.onset, ...quiet.bins]).toEqual(
      Array(69).fill(0),
    );
    const right = windowedAnalyzer({ left: silent, right: signal }, 30).featuresAt(0.5);
    const left = windowedAnalyzer({ left: signal, right: silent }, 30).featuresAt(0.5);
    expect(right.rms).toBeGreaterThan(0);
    expect(right.mids).toBeGreaterThan(0);
    expect(right.bins).toEqual(left.bins);
    expect(right.rms).toBe(left.rms);
  });

  test('unrelated loaded audio cannot change the current spectrum', () => {
    const short = audioData(480000, 0.1);
    const long = audioData(960000, 0.1);
    long.channelWaveforms[0]!.fill(1, 480000);
    const analyze = (audioData: MediaUtilsAudioData) => {
      const channel = {
        audioData: { ...audioData, durationInSeconds: 20 },
        dataOffsetInSeconds: 0,
      };
      return windowedAnalyzer({ left: channel, right: channel }, 30).featuresAt(5);
    };
    expect(analyze(short)).toEqual(analyze(long));
  });

  test('a steady 750 Hz tone has the expected RMS and mid-band energy', () => {
    const amplitude = 0.25;
    const channel = pcmWindow(tone(1, amplitude));
    const features = windowedAnalyzer({ left: channel, right: channel }, 30).featuresAt(0.5);

    // The tone fills an integer number of periods in both the FFT and 1600-sample RMS window.
    expect(features.rms).toBeCloseTo(1 - Math.exp((-3 * amplitude) / Math.SQRT2), 8);
    // All seven smoothed FFT bins stay inside the 80 bins covering 150..2000 Hz.
    expect(features.mids).toBeCloseTo(1 - Math.exp((-60 * amplitude) / 80), 7);
    expect(features.bass).toBeCloseTo(0, 7);
    expect(features.highs).toBeCloseTo(0, 7);
    expect(features.onset).toBeCloseTo(0, 12);
  });

  test('antiphase stereo keeps spectral and RMS energy while preserving opposite waveforms', () => {
    const samples = tone(1);
    const left = pcmWindow(samples);
    const right = pcmWindow(samples.map((sample) => -sample));
    const mono = windowedAnalyzer({ left, right: left }, 30).featuresAt(0.5);
    const antiphase = windowedAnalyzer({ left, right }, 30).featuresAt(0.5);
    expect(antiphase.rms).toBe(mono.rms);
    expect(antiphase.mids).toBeCloseTo(mono.mids, 12);
    for (let bin = 0; bin < mono.bins.length; bin++) {
      expect(antiphase.bins[bin]).toBeCloseTo(mono.bins[bin]!, 12);
    }
    expect(antiphase.wave.left).toEqual(mono.wave.left);
    expect(antiphase.wave.right).toEqual(antiphase.wave.left.map((sample) => -sample));
  });

  test('sharing one mono channel is equivalent to two equal channel windows', () => {
    const left = pcmWindow(tone(1));
    const right = pcmWindow(left.audioData.channelWaveforms[0]!.slice());
    const shared = windowedAnalyzer({ left, right: left }, 30);
    const separate = windowedAnalyzer({ left, right }, 30);
    for (const time of [0, 0.125, 0.5, 0.99, 1]) {
      expectFeaturesClose(separate.featuresAt(time), shared.featuresAt(time));
    }
  });

  test('a stereo impulse has independently computed loudness, onset and band energy', () => {
    const samples = new Float32Array(sampleRate);
    samples[sampleRate / 2] = 1;
    const left = pcmWindow(samples);
    const right = pcmWindow(samples.map((sample) => -sample / 2));
    const features = windowedAnalyzer({ left, right }, 30).featuresAt(0.5);
    const loudness = 1 - Math.exp(-3 * Math.sqrt(1.25 / (2 * 1600)));
    const magnitude = (0.6 * 2 * Math.sqrt(1.25 / 2)) / FFT_SIZE;
    expect(features.rms).toBeCloseTo(loudness, 12);
    expect(features.onset).toBeCloseTo(1 - Math.exp(-4 * loudness), 12);
    expect(features.bass).toBeCloseTo(1 - Math.exp(-14 * magnitude), 12);
    expect(features.mids).toBeCloseTo(1 - Math.exp(-60 * magnitude), 12);
    expect(features.highs).toBeCloseTo(1 - Math.exp(-160 * magnitude), 12);
  });

  test('overlapping decoded windows agree at the same absolute time, including nonzero offsets', () => {
    const samples = tone(8);
    samples.fill(0, 3 * sampleRate, 3.5 * sampleRate);
    const first = pcmWindow(samples.slice(0, 6 * sampleRate), 0, 8);
    const second = pcmWindow(samples.slice(2 * sampleRate), 2, 8);
    const firstAnalyzer = windowedAnalyzer({ left: first, right: first }, 30);
    const secondAnalyzer = windowedAnalyzer({ left: second, right: second }, 30);
    for (const time of [2.25, 3, 3.125, 3.5, 4.75, 5.875]) {
      expectFeaturesClose(secondAnalyzer.featuresAt(time), firstAnalyzer.featuresAt(time));
    }
  });

  test('features are independent of query order, lazy property order, and FPS', () => {
    const samples = tone(2);
    samples.fill(0, 0, sampleRate / 2);
    samples.fill(0, sampleRate, (sampleRate * 3) / 2);
    const channel = pcmWindow(samples);
    const times = [0, 0.49, 0.5, 0.51, 0.55, 0.75, 1, 1.5, 1.55, 1.9];
    const sequential = windowedAnalyzer({ left: channel, right: channel }, 30);
    const expected = times.map((time) => materialize(sequential.featuresAt(time)));
    const shuffled = windowedAnalyzer({ left: channel, right: channel }, 60);
    const unread = times.map((time) => shuffled.featuresAt(time));
    for (const index of [9, 0, 5, 3, 8, 1, 7, 4, 6, 2, 9, 0]) {
      expect(unread[index]!.wave).toEqual(expected[index]!.wave);
      expect(unread[index]!.onset).toBe(expected[index]!.onset);
      expect(materialize(shuffled.featuresAt(times[index]!))).toEqual(expected[index]);
    }
  });

  test('real source edges pad spectra while unloaded edges clamp to complete FFT windows', () => {
    const samples = new Float32Array(sampleRate).fill(0.25);
    const full = pcmWindow(samples);
    const middle = pcmWindow(samples, 10, 20);
    const source = windowedAnalyzer({ left: full, right: full }, 30);
    const loaded = windowedAnalyzer({ left: middle, right: middle }, 30);
    const halfFft = FFT_SIZE / 2 / sampleRate;

    expect(source.featuresAt(0).wave.left).toEqual(Array(WAVE_POINTS).fill(0));
    expect(source.featuresAt(1).wave.left).toEqual(Array(WAVE_POINTS).fill(0.25));
    expect(source.featuresAt(0).bins).not.toEqual(source.featuresAt(0.5).bins);
    expect(source.featuresAt(1).bins).not.toEqual(source.featuresAt(0.5).bins);
    expect(loaded.featuresAt(9)).toBe(loaded.featuresAt(10 + halfFft));
    expect(loaded.featuresAt(12)).toBe(loaded.featuresAt(11 - halfFft));
    expect(loaded.featuresAt(9).bins).toEqual(loaded.featuresAt(10.5).bins);
    expect(loaded.featuresAt(12).bins).toEqual(loaded.featuresAt(10.5).bins);
  });
});

describe('coversLookback', () => {
  const loaded = (fromSeconds: number, seconds: number): ChannelWindow => ({
    audioData: { ...audioData(seconds * 48000), durationInSeconds: 60 },
    dataOffsetInSeconds: fromSeconds,
  });

  test('needs the seconds of history before the frame, not only the frame', () => {
    expect(coversLookback(loaded(20, 10), 25)).toBe(false);
    expect(coversLookback(loaded(10, 20), 25)).toBe(true);
  });

  test('requires the FFT lookahead before a window boundary', () => {
    expect(coversLookback(loaded(0, 10), 9.99)).toBe(false);
    expect(coversLookback(loaded(0, 20), 9.99)).toBe(true);
  });

  test('trims the lookback to the start and the end of the audio', () => {
    expect(coversLookback(loaded(0, 10), 3)).toBe(true);
    expect(coversLookback(loaded(40, 20), 60.02)).toBe(true);
  });

  test('accepts one sample of boundary tolerance but rejects two missing samples', () => {
    const time = 20;
    const earliest = time - HISTORY_SECONDS - 0.2;
    const latest = time + FFT_SIZE / 2 / sampleRate;
    const windowFromSamples = (first: number, last: number) =>
      pcmWindow(new Float32Array(last - first), first / sampleRate, 60);
    const first = Math.round(earliest * sampleRate);
    const last = Math.round(latest * sampleRate);

    expect(coversLookback(windowFromSamples(first, last), time)).toBe(true);
    expect(coversLookback(windowFromSamples(first + 1, last), time)).toBe(true);
    expect(coversLookback(windowFromSamples(first + 2, last), time)).toBe(false);
    expect(coversLookback(windowFromSamples(first, last - 1), time)).toBe(true);
    expect(coversLookback(windowFromSamples(first, last - 2), time)).toBe(false);
  });

  test('readiness supplies identical oldest history features to a complete source', () => {
    const samples = tone(30);
    const full = pcmWindow(samples);
    const partial = pcmWindow(samples.slice(10 * sampleRate, 25 * sampleRate), 10, 30);
    expect(coversLookback(partial, 20)).toBe(true);
    const source = windowedAnalyzer({ left: full, right: full }, 30);
    const loaded = windowedAnalyzer({ left: partial, right: partial }, 30);
    for (const time of [12, 12 + 1 / 30, 19.99, 20]) {
      expectFeaturesClose(loaded.featuresAt(time), source.featuresAt(time));
    }
  });
});

import { expect, test } from 'vite-plus/test';
import { pcmAnalyzer, SILENCE } from '@setcast/core';
import { LiveAudio, inputChannels } from './audio.ts';

const rate = 48000;
const tone = (seconds: number, frequency: number) =>
  Float32Array.from(
    { length: seconds * rate },
    (_, sample) => 0.4 * Math.sin((sample * frequency * Math.PI * 2) / rate),
  );

test('rolling live features match recorded PCM including antiphase stereo and history', () => {
  const left = tone(2, 100);
  const right = left.map((sample) => -sample);
  const live = new LiveAudio(rate);
  for (let start = 0; start < left.length; start += 1024) {
    live.append(start, left.slice(start, start + 1024), right.slice(start, start + 1024));
  }
  const channel = { sampleRate: rate, offsetSeconds: 0, durationSeconds: 2 };
  const recorded = pcmAnalyzer({
    left: { ...channel, samples: left },
    right: { ...channel, samples: right },
  });
  for (const time of [1.5, 0, 0.1, 1.9, 0.5]) {
    expect(live.featuresAt(time)).toEqual(recorded.featuresAt(time));
  }
  expect(live.featuresAt(1).bass).toBeGreaterThan(0.1);
  expect(live.featuresAt(-1)).toBe(SILENCE);
  expect(live.featuresAt(2)).toBe(SILENCE);
});

test('retention is bounded, gaps are silence, and routing changes discard old analysis', () => {
  const live = new LiveAudio(rate);
  const signal = tone(1, 100);
  for (let second = 0; second < 15; second++) live.append(second * rate, signal, signal);
  expect(live.capacity).toBe(11 * rate);
  expect(live.featuresAt(1)).toBe(SILENCE);
  expect(live.featuresAt(7).bass).toBeGreaterThan(0);
  live.append(16 * rate, signal, signal);
  expect(live.featuresAt(15.5).rms).toBe(0);
  expect(live.featuresAt(16.5).rms).toBeGreaterThan(0);
  live.clear();
  expect(live.cachedMoments).toBe(0);
  expect(live.featuresAt(16.5)).toBe(SILENCE);
  live.append(17 * rate, signal, signal);
  expect(live.featuresAt(17.5).bass).toBeGreaterThan(0);
  expect(() => live.append(17 * rate, signal, signal)).toThrow('ordered, nonoverlapping');
});

// Every cache miss materializes four FFTs; shared CI runners can exceed the default 5 seconds.
test('feature cache has a hard limit even for dense query schedules', () => {
  const live = new LiveAudio(8000);
  const signal = new Float32Array(8000);
  live.append(0, signal, signal);
  for (let sample = 0; sample < 2100; sample++) live.featuresAt(sample / 8000);
  expect(live.cachedMoments).toBe(2048);
}, 30_000);

test('channel mapping preserves mono and rejects physical channels not exposed by capture', () => {
  expect(inputChannels(null, 1)).toEqual([1, 1]);
  expect(inputChannels(null, 8)).toEqual([1, 2]);
  expect(inputChannels([3, 4], 8)).toEqual([3, 4]);
  expect(inputChannels([4, 4], 8)).toEqual([4, 4]);
  expect(() => inputChannels([3, 4], 2)).toThrow('browser exposes 2 channel(s)');
  expect(() => inputChannels([0, 1], 2)).toThrow('Choose channels from 1 to 2');
});

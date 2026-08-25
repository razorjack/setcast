import { describe, expect, test } from 'vite-plus/test';
import type { Pcm } from './audio.ts';
import { detectSections, envelope, estimateBpm } from './analysis.ts';

const RATE = 16000;

/** Builds mono audio from a function of time, so a test can describe a set rather than samples. */
const audio = (seconds: number, at: (t: number) => number): Pcm => ({
  samples: Float32Array.from({ length: seconds * RATE }, (_, i) => at(i / RATE)),
  sampleRate: RATE,
});

const tone = (t: number, hz: number, gain = 1) => gain * Math.sin(2 * Math.PI * hz * t);

describe('envelope', () => {
  test('splits bass from everything above it', () => {
    const env = envelope(audio(4, (t) => (t < 2 ? tone(t, 60) : tone(t, 5000))));
    const half = env.bass.length >> 1;
    expect(env.bass[half >> 1]!).toBeGreaterThan(0.8);
    expect(env.bass[half + (half >> 1)]!).toBeLessThan(0.05);
    expect(env.high[half + (half >> 1)]!).toBeGreaterThan(0.8);
  });
});

describe('detectSections', () => {
  // loud bass, a 10 s stretch with almost none, loud bass again
  const set = audio(30, (t) => tone(t, 60, t >= 10 && t < 20 ? 0.08 : 1) + tone(t, 3000, 0.2));

  test('marks where the bass drops out and where it comes back', () => {
    const events = detectSections(envelope(set));
    expect(events.map((e) => e.type)).toEqual(['breakdown', 'drop']);
    expect(events[0]!.time).toBeGreaterThan(9);
    expect(events[0]!.time).toBeLessThan(11);
    expect(events[1]!.time).toBeGreaterThan(19);
    expect(events[1]!.time).toBeLessThan(21);
  });

  test('a drop carries the mean bass of its stretch as intensity', () => {
    const drop = detectSections(envelope(set))[1]!;
    expect(drop.type === 'drop' && drop.intensity).toBeGreaterThan(0.7);
  });

  test('nothing to split means no events', () => {
    expect(detectSections(envelope(audio(30, (t) => tone(t, 60))))).toEqual([]);
  });
});

describe('estimateBpm', () => {
  /** A kick every beat over a steady bass note: what autocorrelation is meant to find. */
  const beats = (bpm: number) =>
    audio(40, (t) => {
      const into = (t * bpm) / 60 - Math.floor((t * bpm) / 60);
      return tone(t, 55, 0.3) + (into < 0.04 ? tone(t, 3000) : 0);
    });

  test('finds the tempo', () => {
    expect(estimateBpm(envelope(beats(150)))!).toBeCloseTo(150, 0);
  });

  test('prefers the fast reading of a half-tempo beat', () => {
    expect(estimateBpm(envelope(beats(174)))!).toBeCloseTo(174, 0);
  });

  test('silence has no tempo', () => {
    expect(estimateBpm(envelope(audio(40, () => 0)))).toBeNull();
  });
});

import { describe, expect, test } from 'vite-plus/test';
import type { Pcm } from './audio.ts';
import { beatOffset, detectSections, envelope, estimateBpm, nearestBeat } from './analysis.ts';

const RATE = 16000;

/** Builds mono audio from a function of time, so a test can describe a set rather than samples. */
const audio = (seconds: number, at: (time: number) => number): Pcm => ({
  samples: Float32Array.from({ length: seconds * RATE }, (_, i) => at(i / RATE)),
  sampleRate: RATE,
});

const tone = (time: number, hz: number, gain = 1) => gain * Math.sin(2 * Math.PI * hz * time);

describe('envelope', () => {
  test('splits bass from everything above it', () => {
    // Two seconds of 60 Hz, then two of 5 kHz.
    const energy = envelope(audio(4, (t) => (t < 2 ? tone(t, 60) : tone(t, 5000))));
    const intoBass = Math.floor(energy.bass.length * 0.25);
    const intoHighs = Math.floor(energy.bass.length * 0.75);

    expect(energy.bass[intoBass]!).toBeGreaterThan(0.8);
    expect(energy.bass[intoHighs]!).toBeLessThan(0.05);
    expect(energy.high[intoHighs]!).toBeGreaterThan(0.8);
  });
});

describe('detectSections', () => {
  // loud bass, a 10 s stretch with almost none, loud bass again
  const set = audio(30, (t) => tone(t, 60, t >= 10 && t < 20 ? 0.08 : 1) + tone(t, 3000, 0.2));

  test('marks where the bass drops out and where it comes back', () => {
    const events = detectSections(envelope(set));
    expect(events.map((event) => event.type)).toEqual(['breakdown', 'drop']);
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
  const beats = (bpm: number, offset = 0) =>
    audio(40, (t) => {
      const beat = ((t - offset) * bpm) / 60;
      const into = beat - Math.floor(beat);
      return tone(t, 55, 0.3) + (into < 0.04 && t >= offset ? tone(t, 3000) : 0);
    });

  test('nearestBeat snaps to the grid and beatOffset finds its first beat', () => {
    const energy = envelope(beats(150, 0.1));
    expect(nearestBeat(energy, 150, 10.25)).toBeCloseTo(10.1, 1);
    expect(nearestBeat(energy, 150, 10.4)).toBeCloseTo(10.5, 1);
    expect(beatOffset(energy, 150)).toBeCloseTo(0.1, 1);
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

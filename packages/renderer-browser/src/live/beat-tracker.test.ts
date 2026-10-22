import { expect, test } from 'vite-plus/test';
import { BeatTracker } from './beat-tracker.ts';
import { LiveAudio } from './audio.ts';

const pulse =
  (bpm: number, offset = 0.17) =>
  (time: number) => {
    const phase = (((((time - offset) * bpm) / 60) % 1) + 1) % 1;
    return phase < 0.06 ? 0.7 * Math.exp(-phase * 40) : 0.001;
  };
function feed(tracker: BeatTracker, energyAt: (time: number) => number, from = 0, until = 12) {
  for (let hop = Math.round(from * 100); hop <= until * 100; hop += 10)
    tracker.update({ capturedTime: hop / 100, energyAt });
}
const phaseError = (time: number, expected: number, bpm: number) => {
  const period = 60 / bpm;
  return Math.abs(((time - expected + period * 100.5) % period) - period / 2);
};

test('locks stable beats and preserves absolute phase after hours on the capture clock', () => {
  for (const bpm of [100, 120, 128, 174]) {
    const tracker = new BeatTracker();
    feed(tracker, pulse(bpm), 28800, 28812);
    expect(tracker.state, String(bpm)).toBe('locked');
    expect(tracker.estimate!.bpm).toBeCloseTo(bpm, 0);
    expect(phaseError(tracker.estimate!.beatOffset, 0.17, bpm)).toBeLessThan(0.025);
  }
});

test('half/double-time competitors stay uncertain until the operator narrows the range', () => {
  const tracker = new BeatTracker();
  tracker.configure({ min: 60, max: 180 });
  feed(tracker, pulse(120));
  expect(tracker.state).toBe('uncertain');
  expect(tracker.estimate!.ambiguous).toBe(true);
  tracker.configure({ min: 110, max: 140 });
  feed(tracker, pulse(120), 12, 24);
  expect(tracker.state).toBe('locked');
  expect(() => tracker.configure({ min: 200, max: 180 })).toThrow('40–240');
});

test('silence, constant levels and irregular noise do not establish a grid', () => {
  for (const energy of [
    () => 0,
    () => 0.5,
    (t: number) => ((Math.imul(Math.round(t * 100), 1664525) >>> 0) % 997) / 997,
  ]) {
    const tracker = new BeatTracker();
    feed(tracker, energy);
    expect(tracker.state).toBe('uncertain');
  }
});

test('silence, loss, routing reset and tempo changes discard an old lock', () => {
  const tracker = new BeatTracker();
  feed(tracker, pulse(120));
  expect(tracker.state).toBe('locked');
  feed(tracker, () => 0, 12.1, 14);
  expect(tracker.state).toBe('uncertain');
  feed(tracker, pulse(140), 14.1, 26);
  expect(tracker.state).toBe('locked');
  expect(tracker.estimate!.bpm).toBeCloseTo(140, 0);
  tracker.update({ capturedTime: 30, energyAt: pulse(140) });
  expect(tracker.state).toBe('listening');
  expect(tracker.estimate).toBe(null);
  feed(tracker, pulse(140), 30, 42);
  tracker.reset();
  expect(tracker.state).toBe('listening');
  tracker.update({ capturedTime: 0, energyAt: pulse(120) });
  expect(tracker.estimate).toBe(null);
});

test('PCM energy is stereo-safe, bounded by retained capture and independent of FFT caching', () => {
  const audio = new LiveAudio(8000);
  const left = new Float32Array(8000).fill(0.5);
  const right = new Float32Array(8000).fill(-0.5);
  for (let second = 0; second < 15; second++) audio.append(second * 8000, left, right);
  expect(audio.energyAt(14)).toBe(0.5);
  expect(audio.energyAt(1)).toBe(0);
  expect(audio.energyAt(16)).toBe(0);
  expect(audio.energyAt(NaN)).toBe(0);
  expect(audio.cachedMoments).toBe(0);
  audio.clear();
  expect(audio.energyAt(14)).toBe(0);
});

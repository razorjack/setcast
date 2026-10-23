import { expect, test } from 'vite-plus/test';
import { BeatRangeSchema, BeatTrackingSchema } from './beat.ts';
import { BeatTracker } from './beat-tracker.ts';
import { estimateBeat } from './beat-estimate.ts';

function feed(tracker: BeatTracker, from: number, count: number, bpm = 120) {
  for (let hop = from; hop < from + count; hop++) {
    const phase = (((hop / 100 - 0.17) * bpm) / 60 + 1e6) % 1;
    tracker.push({ hop, value: phase < 0.02 ? 1 : 0 });
  }
}

test('beat configuration validates ranges and keeps enablement an explicit operator action', () => {
  expect(BeatTrackingSchema.parse({})).toEqual({ range: { min: 90, max: 180 } });
  expect(BeatRangeSchema.safeParse({ min: 40, max: 240 }).success).toBe(true);
  for (const range of [
    { min: 90, max: 95 },
    { min: 0, max: 150 },
    { min: 100, max: Infinity },
  ])
    expect(BeatRangeSchema.safeParse(range).success).toBe(false);
  expect(BeatTrackingSchema.safeParse({ enabled: true }).success).toBe(false);
});

test('explicit-hop tracking bounds history, retains absolute phase and explains its evidence', () => {
  const tracker = new BeatTracker();
  feed(tracker, 2880000, 3000);
  expect(tracker.retainedHops).toBe(800);
  expect(tracker.state).toBe('locked');
  expect(tracker.estimate!.bpm).toBeCloseTo(120, 0);
  const estimate = tracker.estimate!;
  expect(estimate.beatOffset).toBeGreaterThan(28800);
  expect(estimate.confidence).toBe(
    Math.min(estimate.periodicity, estimate.phaseStrength, estimate.recentAgreement),
  );
  expect(estimate.margin).toBeGreaterThanOrEqual(0.08);
  expect(estimate.competitorBpm).not.toBe(null);
});

test('missing hops discard the window; duplicate and invalid samples fail without corrupting it', () => {
  const tracker = new BeatTracker();
  feed(tracker, 0, 1200);
  expect(tracker.state).toBe('locked');
  for (const sample of [
    { hop: 1199, value: 0 },
    { hop: 1200, value: NaN },
    { hop: 1.2, value: 1 },
  ])
    expect(() => tracker.push(sample)).toThrow('BeatTracker.push');
  expect(tracker.state).toBe('locked');
  tracker.push({ hop: 1201, value: 1 });
  expect(tracker.state).toBe('listening');
  expect(tracker.estimate).toBe(null);
  expect(tracker.retainedHops).toBe(1);
  tracker.reset();
  feed(tracker, 0, 1200);
  expect(tracker.state).toBe('locked');
});

test('configuration is copied and invalid changes preserve the current tracker', () => {
  const tracker = new BeatTracker();
  const range = { min: 110, max: 140 };
  tracker.configure(range);
  range.min = 40;
  feed(tracker, 0, 1200);
  expect(tracker.state).toBe('locked');
  expect(() => tracker.configure({ min: 200, max: 100 })).toThrow('40–240');
  expect(tracker.state).toBe('locked');
  tracker.configure({ min: 60, max: 180 });
  expect(tracker.state).toBe('listening');
  feed(tracker, 0, 1200);
  expect(tracker.estimate!.ambiguous).toBe(true);
});

test('standalone estimation rejects malformed windows and clocks', () => {
  const range = { min: 90, max: 180 };
  expect(() => estimateBeat([], 0, range)).toThrow('800');
  expect(() => estimateBeat(Array(800).fill(-1), 0, range)).toThrow('nonnegative');
  expect(() => estimateBeat(Array(800).fill(0), -1, range)).toThrow('start');
  const silence = estimateBeat(Array(800).fill(0), 0, range);
  expect(silence.confidence).toBe(0);
  expect(silence.ambiguous).toBe(true);
});

test('recent phase disagreement removes an old lock while the long window still looks periodic', () => {
  const tracker = new BeatTracker();
  for (let hop = 0; hop < 1600; hop++) tracker.push({ hop, value: hop % 50 === 17 ? 1 : 0 });
  expect(tracker.state).toBe('locked');
  for (let hop = 1600; hop <= 1650; hop++) {
    const phase = (((((hop / 100 - 0.17) * 140) / 60) % 1) + 1) % 1;
    tracker.push({ hop, value: phase < 0.04 ? 1 : 0 });
  }
  expect(tracker.estimate!.bpm).toBe(120);
  expect(tracker.estimate!.periodicity).toBeGreaterThan(0.55);
  expect(tracker.estimate!.phaseStrength).toBeGreaterThan(0.55);
  expect(tracker.estimate!.recentAgreement).toBeLessThan(0.55);
  expect(tracker.state).toBe('uncertain');
  expect(tracker.reason).toContain('Recent transients disagree');
});

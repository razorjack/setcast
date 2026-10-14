import { describe, expect, test } from 'vite-plus/test';
import { panelMotion } from './NowPlaying.tsx';

const run = { from: 0, until: 120_000_000 };
const timing = { dwell: 14, fade: 1.2 };

const presenceAt = (timeSeconds: number, dj: boolean, listed: number | null, dwell = 14) =>
  panelMotion(run, { timeSeconds, timing: { ...timing, dwell }, dj, listed }).presence;

describe('panelMotion', () => {
  test('a DJ panel keeps its credit for the whole run without a tracklist', () => {
    expect(presenceAt(60, true, null)).toBe(1);
    expect(presenceAt(60, true, 0)).toBe(1);
  });

  test('a listed DJ panel hands its credit to the tracklist once the dwell is up', () => {
    expect(presenceAt(5, true, 1)).toBeCloseTo(1);
    expect(presenceAt(60, true, 1)).toBe(0);
    expect(presenceAt(60, true, 0.5)).toBe(0.5);
    const motion = panelMotion(run, { timeSeconds: 60, timing, dj: true, listed: 1 });
    expect(motion.handedOver).toBe(1);
  });

  test('dwell 0 keeps a listed DJ panel up; playlist panels always follow the dwell', () => {
    expect(presenceAt(60, true, 1, 0)).toBe(1);
    expect(presenceAt(60, false, null)).toBe(0);
  });
});

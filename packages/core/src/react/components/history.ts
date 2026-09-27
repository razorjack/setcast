import {
  PEAK_FALL_SECONDS,
  peakHold,
  WAVE_SECONDS,
  type AudioFeatures,
  type Wave,
} from '../../audio.ts';
import { audioHistory, useFrame } from '../frame.tsx';

const MOMENTS_PER_SECOND = 30;

/**
 * The held peak of each level in `levels`, or none when `hold` is 0. `levelsOf` measures the same
 * levels at an earlier moment, so the peaks come from the audio history, not from earlier frames.
 */
export function usePeaks(
  hold: number,
  levels: number[],
  levelsOf: (audio: AudioFeatures) => number[],
): number[] {
  const frame = useFrame();
  if (hold === 0) return [];

  const seconds = hold + PEAK_FALL_SECONDS;
  const moments = audioHistory(frame, seconds, Math.round(seconds * MOMENTS_PER_SECOND));
  const past = moments.map(({ time, audio }) => ({
    age: frame.timeSeconds - time,
    levels: levelsOf(audio),
  }));
  return peakHold(levels, past, hold);
}

/** A wave from before this frame, with its age as a share of the trail: near 0 is recent. */
export interface TrailWave {
  wave: Wave;
  age: number;
}

/** The waves of the `count` moments before this frame, oldest first, one wave length apart. */
export function useTrail(count: number): TrailWave[] {
  const frame = useFrame();
  if (count === 0) return [];

  const moments = audioHistory(frame, (count + 1) * WAVE_SECONDS, count + 1);
  const earlier = moments.filter(({ time }) => time < frame.timeSeconds - WAVE_SECONDS / 2);
  return earlier.slice(-count).map(({ audio }, index, trail) => ({
    wave: audio.wave,
    age: (trail.length - index) / (trail.length + 1),
  }));
}

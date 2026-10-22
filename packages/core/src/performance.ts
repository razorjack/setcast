import { z } from 'zod';
import type { AudioAnalyzer, AudioFeatures } from './audio.ts';

const level = (name: string, maximum: number) => {
  const error = `performance.${name} must be a number from 0 to ${maximum}.`;
  return z.number({ error }).min(0, { error }).max(maximum, { error });
};
export const PerformanceSchema = z.strictObject(
  { intensity: level('intensity', 2).default(1), brightness: level('brightness', 1).default(1) },
  { error: 'performance accepts intensity (0 to 2) and brightness (0 to 1).' },
);
export type PerformanceState = z.infer<typeof PerformanceSchema>;
export const DEFAULT_PERFORMANCE: PerformanceState = { intensity: 1, brightness: 1 };
const durationError = 'Performance duration must be seconds from 0 to 30.';
export const PerformanceRampSchema = z.strictObject(
  {
    from: PerformanceSchema,
    to: PerformanceSchema,
    duration: z
      .number({ error: durationError })
      .min(0, { error: durationError })
      .max(30, { error: durationError }),
  },
  { error: 'A performance ramp accepts from, to and duration.' },
);
export const PerformanceEventSchema = PerformanceRampSchema.extend({
  at: z
    .number({ error: 'Performance at must be nonnegative seconds.' })
    .nonnegative({ error: 'Performance at must be nonnegative seconds.' }),
});
export const AutomationSchema = z
  .array(PerformanceEventSchema, {
    error: 'automation must be a list of performance ramps with at, from, to and duration.',
  })
  .refine(
    (events) => events.every((event, index) => index === 0 || event.at >= events[index - 1]!.at),
    {
      error: 'automation entries must be ordered by at. Equal times use the last entry.',
    },
  );
export type PerformanceEvent = z.infer<typeof PerformanceEventSchema>;

export function rampAt(event: PerformanceEvent, time: number): PerformanceState {
  const progress =
    event.duration === 0 ? 1 : Math.max(0, Math.min(1, (time - event.at) / event.duration));
  return {
    intensity: event.from.intensity + (event.to.intensity - event.from.intensity) * progress,
    brightness: event.from.brightness + (event.to.brightness - event.from.brightness) * progress,
  };
}

export function performanceAt(
  initial: PerformanceState,
  events: readonly PerformanceEvent[],
  time: number,
) {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (events[middle]!.at <= time) low = middle + 1;
    else high = middle;
  }
  const event = events[low - 1];
  return event ? rampAt(event, time) : initial;
}

/** Visual sensitivity only: input PCM and the recorded master remain unchanged. */
export function performanceAnalyzer(analyzer: AudioAnalyzer, intensity: number): AudioAnalyzer {
  if (intensity === 1) return analyzer;
  return { featuresAt: (time) => scaleFeatures(analyzer.featuresAt(time), intensity) };
}

function scaleFeatures(audio: AudioFeatures, intensity: number): AudioFeatures {
  const scale = (value: number) => Math.min(1, value * intensity);
  return {
    bass: scale(audio.bass),
    mids: scale(audio.mids),
    highs: scale(audio.highs),
    rms: scale(audio.rms),
    onset: scale(audio.onset),
    bins: audio.bins.map(scale),
    wave: {
      left: audio.wave.left.map((value) => Math.max(-1, scale(value))),
      right: audio.wave.right.map((value) => Math.max(-1, scale(value))),
    },
  };
}

export function nextBar(time: number, bpm: number | null, offset: number): number {
  if (!bpm) return time;
  const bar = 240 / bpm;
  return offset + Math.ceil((time - offset) / bar - 1e-9) * bar;
}

import { z } from 'zod';

/** Onset samples use absolute 10 ms hops, independently of output FPS. */
export const BEAT_HOPS_PER_SECOND = 100;
export const BEAT_WINDOW_HOPS = 800;

export const BeatRangeSchema = z
  .strictObject(
    {
      min: z
        .number({ error: 'beatTracking.range.min must be a BPM value from 40 to 230.' })
        .min(40, { error: 'Minimum detected BPM must be at least 40.' })
        .max(230, { error: 'Minimum detected BPM must be at most 230, leaving a 10 BPM range.' }),
      max: z
        .number({ error: 'beatTracking.range.max must be a BPM value from 50 to 240.' })
        .min(50, { error: 'Maximum detected BPM must be at least 50, leaving a 10 BPM range.' })
        .max(240, { error: 'Maximum detected BPM must be at most 240.' }),
    },
    { error: 'beatTracking.range accepts only min and max BPM values.' },
  )
  .refine((range) => range.max - range.min >= 10, {
    error: 'Choose 40–240 BPM, at least 10 BPM apart.',
  });

export const BeatTrackingSchema = z.strictObject(
  {
    range: BeatRangeSchema.default({ min: 90, max: 180 }),
  },
  {
    error: 'beatTracking accepts only range settings. Enable detection explicitly in the operator.',
  },
);

export type BeatRange = z.infer<typeof BeatRangeSchema>;
export type BeatTrackingConfig = z.infer<typeof BeatTrackingSchema>;

export interface BeatOnset {
  /** Safe nonnegative integer on the source's absolute 100 Hz clock. */
  hop: number;
  /** Finite nonnegative novelty. The energy baseline uses positive log1p(100 * RMS) changes. */
  value: number;
}

export function validBeatRange(range: BeatRange): boolean {
  return BeatRangeSchema.safeParse(range).success;
}

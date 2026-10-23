import { z } from 'zod';

export const TEST_PATTERNS = ['alignment', 'grayscale', 'detail', 'motion'] as const;

export const TestPatternSchema = z.strictObject(
  {
    pattern: z
      .enum(TEST_PATTERNS, {
        error:
          'testPattern.pattern must be alignment, grayscale, detail or motion. Choose one test image.',
      })
      .default('grayscale'),
    level: z
      .number({ error: 'testPattern.level must be a number from 0.1 to 1.' })
      .min(0.1, {
        error:
          'testPattern.level must be at least 0.1. Use brightness or blackout to dim the output further.',
      })
      .max(1, { error: 'testPattern.level must be at most 1 (full signal level).' })
      .default(1),
    speed: z
      .number({ error: 'testPattern.speed must be cycles per second from 0 to 1.' })
      .min(0, { error: 'testPattern.speed cannot be negative. Use 0 to freeze motion.' })
      .max(1, { error: 'testPattern.speed must be at most 1 cycle per second.' })
      .default(0.1),
    detailSize: z
      .number({
        error: 'testPattern.detailSize must be a whole number of composition pixels from 1 to 64.',
      })
      .int({ error: 'testPattern.detailSize must be a whole number of composition pixels.' })
      .min(1, { error: 'testPattern.detailSize must be at least 1 composition pixel.' })
      .max(64, { error: 'testPattern.detailSize must be at most 64 composition pixels.' })
      .default(8),
    safeArea: z
      .number({ error: 'testPattern.safeArea must be an inset fraction from 0 to 0.25.' })
      .min(0, { error: 'testPattern.safeArea cannot be negative. Use 0 to hide the inset guide.' })
      .max(0.25, { error: 'testPattern.safeArea must be at most 0.25 of each dimension.' })
      .default(0.1),
  },
  {
    error: 'testPattern must contain only pattern, level, speed, detailSize and safeArea settings.',
  },
);

export type TestPatternConfig = z.infer<typeof TestPatternSchema>;

export const TestPatternPresetSchema = z.strictObject(
  {
    version: z.literal(1, {
      error: 'Unsupported test pattern preset. Import a version 1 preset exported by Setcast.',
    }),
    testPattern: TestPatternSchema,
  },
  { error: 'A test pattern preset must contain version: 1 and testPattern settings.' },
);

export type TestPatternPreset = z.infer<typeof TestPatternPresetSchema>;

/** Reduce time before multiplying so long sessions keep sub-frame motion precision. */
export function testPatternPhase(timeSeconds: number, speed: number): number {
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0)
    throw new RangeError(
      `testPatternPhase received timeSeconds=${timeSeconds}. Use finite, nonnegative absolute seconds.`,
    );
  if (!Number.isFinite(speed) || speed < 0 || speed > 1)
    throw new RangeError(
      `testPatternPhase received speed=${speed}. Use cycles per second from 0 to 1.`,
    );
  if (speed === 0) return 0.5;
  return (timeSeconds % (1 / speed)) * speed;
}

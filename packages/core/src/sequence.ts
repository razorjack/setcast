import { z } from 'zod';
import { EnergyBandSchema, EnergySelectionSchema } from './energy.ts';

export const SequenceSchema = z.strictObject({
  mode: z
    .enum(['ordered', 'energy'], { error: 'sequence.mode must be ordered or energy.' })
    .optional(),
  energy: EnergySelectionSchema.optional(),
  scenes: z
    .array(
      z.strictObject({
        energy: EnergyBandSchema.optional(),
        preset: z
          .string({ error: 'sequence scene preset must name a saved-scene directory.' })
          .regex(/^saved-scene-[a-zA-Z0-9_-]+$/, {
            error: 'Use a saved-scene-* directory name without slashes.',
          }),
        seconds: z
          .number({ error: 'Scene dwell seconds must be a number from 5 to 3600.' })
          .min(5, { error: 'Scene dwell must be at least 5 seconds.' })
          .max(3600, { error: 'Scene dwell must be at most 3600 seconds.' })
          .default(60),
      }),
      { error: 'sequence.scenes must be an ordered list of saved scenes.' },
    )
    .min(1, { error: 'Add at least one scene to sequence.scenes, or omit sequence.' })
    .max(64, { error: 'Use at most 64 entries in sequence.scenes.' }),
  loop: z.boolean({ error: 'sequence.loop must be true or false.' }).default(true),
});
export type SceneSequence = z.infer<typeof SequenceSchema>;

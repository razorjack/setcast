import { z } from 'zod';
import { DisplaySchema, ProjectConfigSchema } from './config.ts';

const channel = z
  .number({ error: 'Use an input channel number, starting at 1.' })
  .int({ error: 'Use a whole input channel number, starting at 1.' })
  .min(1, { error: 'Input channels start at 1.' })
  .max(32, { error: 'Choose an input channel from 1 to 32.' });

export const LiveConfigSchema = ProjectConfigSchema.pick({
  title: true,
  background: true,
  backgroundFit: true,
  theme: true,
  css: true,
  modulation: true,
  visualizer: true,
  bpm: true,
  beatOffset: true,
}).extend({
  output: DisplaySchema.prefault({}),
  clock: z.boolean({ error: 'clock must be true or false.' }).default(false),
  input: z
    .strictObject({
      device: z
        .string({ error: 'input.device must be an audio input name or device ID.' })
        .min(1, { error: 'input.device cannot be empty; omit it to choose in the browser.' })
        .optional(),
      channels: z
        .tuple([channel, channel], {
          error: 'input.channels must be [left, right], e.g. [3, 4] or [1, 1] for mono.',
        })
        .nullable()
        .default(null),
      gain: z
        .number({ error: 'input.gain must be a number from 0.1 to 10.' })
        .min(0.1, { error: 'input.gain must be at least 0.1.' })
        .max(10, { error: 'input.gain must be at most 10.' })
        .default(1),
      delay: z
        .number({ error: 'input.delay must be seconds from 0 to 2.' })
        .min(0, { error: 'input.delay cannot be negative; use seconds from 0 to 2.' })
        .max(2, { error: 'input.delay must be at most 2 seconds.' })
        .default(0),
    })
    .prefault({}),
});

export type LiveConfig = z.infer<typeof LiveConfigSchema>;

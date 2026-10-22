import { z } from 'zod';

const bounded = (name: string, min: number, max: number) =>
  z
    .number({ error: `${name} must be a number from ${min} to ${max}.` })
    .min(min, { error: `${name} must be at least ${min}.` })
    .max(max, { error: `${name} must be at most ${max}.` });

export const EnergyBandSchema = z.enum(['low', 'medium', 'high', 'any'], {
  error: 'Scene energy must be low, medium, high or any.',
});
export type EnergyBand = Exclude<z.infer<typeof EnergyBandSchema>, 'any'>;
export const EnergySelectionSchema = z
  .strictObject({
    low: bounded('sequence.energy.low', 0.01, 0.95).default(0.2),
    high: bounded('sequence.energy.high', 0.02, 1).default(0.55),
    hysteresis: bounded('sequence.energy.hysteresis', 0, 0.2).default(0.05),
    smooth: bounded('sequence.energy.smooth', 0.1, 30).default(3),
    sustain: bounded('sequence.energy.sustain', 1, 60).default(8),
  })
  .superRefine((settings, context) => {
    if (settings.low + 2 * settings.hysteresis >= settings.high)
      context.addIssue({
        code: 'custom',
        path: ['high'],
        message:
          'sequence.energy.high must exceed low + twice hysteresis. Separate the thresholds or reduce hysteresis.',
      });
  });
export type EnergySelection = z.infer<typeof EnergySelectionSchema>;

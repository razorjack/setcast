import { z } from 'zod';

/** Shared policy for built-in and plugin ShaderCanvas visualizers. */
export const GpuCanvasConfigSchema = z.strictObject(
  {
    resolution: z
      .number({ error: 'resolution must be a number from 0.25 to 1.' })
      .min(0.25, { error: 'resolution must be a number from 0.25 to 1.' })
      .max(1, { error: 'resolution must be a number from 0.25 to 1.' })
      .default(0.5),
    recoverySeconds: z
      .number({ error: 'recoverySeconds must be a number from 0 to 15.' })
      .min(0, {
        error: 'recoverySeconds cannot be negative. Use 0 to fail immediately on context loss.',
      })
      .max(15, {
        error: 'recoverySeconds must be at most 15 seconds. Use a bounded recovery timeout.',
      })
      .default(5),
  },
  { error: 'GPU canvas settings accept resolution and recoverySeconds.' },
);

export type GpuCanvasConfig = z.infer<typeof GpuCanvasConfigSchema>;

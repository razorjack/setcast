import { z } from 'zod';
import { ConfigError, zodIssues } from './errors.ts';
import { Registry } from './registry.ts';

export const SpectrumConfigSchema = z.object({
  name: z.literal('spectrum').default('spectrum'),
  /** Bars per side; the picture is mirrored around the center (bass in the middle). */
  bars: z.number().int().min(8).max(64).default(48),
  gain: z.number().min(0.1).max(4).default(1),
  /** Minimum bar height as a fraction of the full height, so silence still shows a baseline. */
  floor: z.number().min(0).max(0.5).default(0.02),
  gap: z.number().min(0).max(0.9).default(0.5),
});
export type SpectrumConfig = z.infer<typeof SpectrumConfigSchema>;

export const RadialConfigSchema = z.object({
  name: z.literal('radial').default('radial'),
  /** Bars per half; mirrored left/right with bass at the bottom. */
  bars: z.number().int().min(8).max(64).default(40),
  /** Ring radius as a fraction of the box (0..0.5). */
  radius: z.number().min(0.05).max(0.5).default(0.3),
  /** Maximum bar length as a fraction of the box. */
  length: z.number().min(0.05).max(0.5).default(0.18),
  gain: z.number().min(0.1).max(4).default(1),
  floor: z.number().min(0).max(0.5).default(0.03),
  /** Slow rotation in degrees per second; 0 to pin. */
  spin: z.number().min(-90).max(90).default(2),
});
export type RadialConfig = z.infer<typeof RadialConfigSchema>;

export const VisualizerConfigSchema = z.object({ name: z.string().default('spectrum') }).loose();

/**
 * A visualizer as the isomorphic entry knows it: a name and the schema of its `visualizer:` block.
 * `@setcast/core/react` adds the component to the same registry, so the CLI can validate a project
 * without loading React and the renderer still has one list of visualizers.
 */
export interface VisualizerSpec {
  name: string;
  schema: z.ZodType;
}

export const visualizers = new Registry<VisualizerSpec>('visualizer');

visualizers.add({ name: 'spectrum', schema: SpectrumConfigSchema });
visualizers.add({ name: 'radial', schema: RadialConfigSchema });

/** Applies the named visualizer's own schema, filling in its defaults. */
export function resolveVisualizerConfig(config: { name: string } & Record<string, unknown>) {
  if (!visualizers.has(config.name)) {
    throw new ConfigError('setcast.yaml', [
      {
        path: 'visualizer.name',
        message: `Unknown visualizer "${config.name}". Available: ${visualizers.names().join(', ')}.`,
      },
    ]);
  }
  const parsed = visualizers.get(config.name).schema.safeParse(config);
  if (!parsed.success) {
    throw new ConfigError(
      'setcast.yaml',
      zodIssues(parsed.error).map((issue) => ({
        ...issue,
        path: issue.path ? `visualizer.${issue.path}` : 'visualizer',
      })),
    );
  }
  return parsed.data as { name: string } & Record<string, unknown>;
}

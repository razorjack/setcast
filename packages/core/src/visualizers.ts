import { z } from 'zod';
import { ConfigError, zodIssues, type Issue } from './errors.ts';
import { Registry } from './registry.ts';

export const SpectrumConfigSchema = z.strictObject({
  name: z.literal('spectrum').default('spectrum'),
  /** Bars per side; the picture is mirrored around the center (bass in the middle). */
  bars: z.number().int().min(8).max(64).default(48),
  gain: z.number().min(0.1).max(4).default(1),
  /** Minimum bar height as a fraction of the full height, so silence still shows a baseline. */
  floor: z.number().min(0).max(0.5).default(0.02),
  gap: z.number().min(0).max(0.9).default(0.5),
});
export type SpectrumConfig = z.infer<typeof SpectrumConfigSchema>;

export const RadialConfigSchema = z.strictObject({
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

/** A `visualizer:` entry after its own schema filled in the defaults. */
export type VisualizerConfig = { name: string } & Record<string, unknown>;

const VisualizerEntrySchema = z
  .object(
    {
      name: z
        .string({ error: 'name must be the name of a visualizer, e.g. spectrum.' })
        .default('spectrum'),
    },
    { error: 'Each visualizer must be a mapping such as { name: radial }.' },
  )
  .loose();

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

/**
 * The `visualizer:` key as written: one block, or a list of blocks drawn in order (`[]` draws none).
 * Each entry is checked against its own visualizer's schema, so an error points at the entry.
 */
export function resolveVisualizerConfigs(written: unknown): VisualizerConfig[] {
  if (!Array.isArray(written)) return [resolveVisualizerConfig(written)];
  return written.map((entry, index) => resolveVisualizerConfig(entry, `visualizer[${index}]`));
}

/** Applies the named visualizer's own schema, filling in its defaults. `path` locates the block. */
export function resolveVisualizerConfig(written: unknown, path = 'visualizer'): VisualizerConfig {
  const entry = parseEntry(VisualizerEntrySchema, written, path);
  if (!visualizers.has(entry.name)) {
    throw new ConfigError('setcast.yaml', [
      {
        path: `${path}.name`,
        message: `Unknown visualizer "${entry.name}". Available: ${visualizers.names().join(', ')}.`,
      },
    ]);
  }
  return parseEntry(visualizers.get(entry.name).schema, entry, path) as VisualizerConfig;
}

function parseEntry<T>(schema: z.ZodType<T>, written: unknown, path: string): T {
  const parsed = schema.safeParse(written);
  if (parsed.success) return parsed.data;
  throw new ConfigError('setcast.yaml', underPath(path, zodIssues(parsed.error)));
}

/** The schema sees the block alone; the user reads the path against the whole `setcast.yaml`. */
const underPath = (prefix: string, issues: Issue[]): Issue[] =>
  issues.map(({ path, message }) => ({
    path: path ? `${prefix}.${path}` : prefix,
    message,
  }));

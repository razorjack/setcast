import { z } from 'zod';
import { ConfigError, zodIssues, type Issue } from './errors.ts';
import { Registry } from './registry.ts';

/** A number in a `visualizer:` block, with one message for every way it can be wrong. */
function numberSetting(key: string, min: number, max: number) {
  const error = `${key} must be a number from ${min} to ${max}.`;
  return z.number({ error }).min(min, { error }).max(max, { error });
}

function wholeNumberSetting(key: string, min: number, max: number) {
  const error = `${key} must be a whole number from ${min} to ${max}.`;
  return z.number({ error }).int({ error }).min(min, { error }).max(max, { error });
}

/** A visualizer's block. An unknown key is reported with the keys the visualizer does take. */
function visualizerSchema<Name extends string, Shape extends z.ZodRawShape>(
  name: Name,
  shape: Shape,
) {
  const keys = Object.keys(shape).join(', ');
  return z.strictObject(
    { name: z.literal(name).default(name), ...shape },
    {
      error: (issue) => {
        if (issue.code !== 'unrecognized_keys') return undefined;
        return `Unknown key "${issue.keys[0]}". ${name} takes: ${keys}.`;
      },
    },
  );
}

const StyleSchema = z.enum(['bars', 'line'], { error: 'style must be bars or line.' });

export const SpectrumConfigSchema = visualizerSchema('spectrum', {
  /** Bars as rects, or one smooth line through their tops over a filled area. */
  style: StyleSchema.default('bars'),
  /** Bars per side; the picture is mirrored around the center (bass in the middle). */
  bars: wholeNumberSetting('bars', 8, 64).default(48),
  gain: numberSetting('gain', 0.1, 4).default(1),
  /** Minimum bar height as a fraction of the full height, so silence still shows a baseline. */
  floor: numberSetting('floor', 0, 0.5).default(0.02),
  gap: numberSetting('gap', 0, 0.9).default(0.5),
  /** Splits each bar into this many cells, lit from the bottom like an LED ladder. 0 is solid. */
  segments: wholeNumberSetting('segments', 0, 32).default(0),
}).refine((config) => config.style === 'bars' || config.segments === 0, {
  path: ['segments'],
  error: 'segments only applies to style: bars. Remove it, or set style: bars.',
});
export type SpectrumConfig = z.infer<typeof SpectrumConfigSchema>;

export const RadialConfigSchema = visualizerSchema('radial', {
  /** Bars as ticks off the ring, or one smooth closed line through their tips. */
  style: StyleSchema.default('bars'),
  /** Bars per half; mirrored left/right with bass at the bottom. */
  bars: wholeNumberSetting('bars', 8, 64).default(40),
  /** Ring radius as a fraction of the box (0..0.5). */
  radius: numberSetting('radius', 0.05, 0.5).default(0.3),
  /** Maximum bar length as a fraction of the box. */
  length: numberSetting('length', 0.05, 0.5).default(0.18),
  gain: numberSetting('gain', 0.1, 4).default(1),
  floor: numberSetting('floor', 0, 0.5).default(0.03),
  /** Slow rotation in degrees per second; 0 to pin. */
  spin: numberSetting('spin', -90, 90).default(2),
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

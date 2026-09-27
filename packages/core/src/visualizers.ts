import { z } from 'zod';
import { FEATURE_SOURCES, HISTORY_SECONDS } from './audio.ts';
import { ConfigError, zodIssues, type Issue } from './errors.ts';
import type { ResolvedProject } from './project.ts';
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
  const keys = Object.keys(shape);
  const takes = keys.length ? `${name} takes: ${keys.join(', ')}.` : `${name} takes only name.`;
  return z.strictObject(
    { name: z.literal(name).default(name), ...shape },
    {
      error: (issue) => {
        if (issue.code !== 'unrecognized_keys') return undefined;
        return `Unknown key "${issue.keys[0]}". ${takes}`;
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

const bandsError = `bands must be a list of audio features: ${FEATURE_SOURCES.join(', ')}.`;

export const MetersConfigSchema = visualizerSchema('meters', {
  /** One level meter per audio feature, left to right. */
  bands: z
    .array(z.enum(FEATURE_SOURCES, { error: bandsError }), { error: bandsError })
    .min(1, { error: bandsError })
    .default(['bass', 'mids', 'highs', 'rms']),
  gain: numberSetting('gain', 0.1, 4).default(1),
  floor: numberSetting('floor', 0, 0.5).default(0),
  /** Cells per meter, lit from the bottom. 0 is a solid bar. */
  segments: wholeNumberSetting('segments', 0, 48).default(16),
});
export type MetersConfig = z.infer<typeof MetersConfigSchema>;

export const OscilloscopeConfigSchema = visualizerSchema('oscilloscope', {
  /** Amplitude scale; the trace clips at the edges of its box. */
  gain: numberSetting('gain', 0.1, 8).default(1),
});
export type OscilloscopeConfig = z.infer<typeof OscilloscopeConfigSchema>;

export const VectorscopeConfigSchema = visualizerSchema('vectorscope', {
  /** Amplitude scale; the trace clips at the edge of its circle. */
  gain: numberSetting('gain', 0.1, 8).default(1),
});
export type VectorscopeConfig = z.infer<typeof VectorscopeConfigSchema>;

export const SpectrogramConfigSchema = visualizerSchema('spectrogram', {
  /** How much of the past scrolls across, newest at the right. */
  seconds: numberSetting('seconds', 1, HISTORY_SECONDS).default(4),
  gain: numberSetting('gain', 0.1, 4).default(1),
});
export type SpectrogramConfig = z.infer<typeof SpectrogramConfigSchema>;

/** The whole set as a strip; what it marks and how it looks is the theme's. */
export const OverviewConfigSchema = visualizerSchema('overview', {});
export type OverviewConfig = z.infer<typeof OverviewConfigSchema>;

/** A `visualizer:` entry after its own schema filled in the defaults. */
export type VisualizerConfig = { name: string } & Record<string, unknown>;

/** A `visualizer:` entry as written, where every key but `name` may be left to its default. */
export type VisualizerInput = { name: string } & Record<string, unknown>;

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
  /** Draws the whole set from `project.envelope`, which commands that render then read first. */
  wholeSet?: boolean;
}

export const visualizers = new Registry<VisualizerSpec>('visualizer');

visualizers.add({ name: 'spectrum', schema: SpectrumConfigSchema });
visualizers.add({ name: 'radial', schema: RadialConfigSchema });
visualizers.add({ name: 'meters', schema: MetersConfigSchema });
visualizers.add({ name: 'oscilloscope', schema: OscilloscopeConfigSchema });
visualizers.add({ name: 'vectorscope', schema: VectorscopeConfigSchema });
visualizers.add({ name: 'spectrogram', schema: SpectrogramConfigSchema });
visualizers.add({ name: 'overview', schema: OverviewConfigSchema, wholeSet: true });

/** Whether a visualizer of `project` needs `project.envelope`. */
export const drawsWholeSet = (project: ResolvedProject): boolean =>
  project.visualizers.some((config) => visualizers.get(config.name).wholeSet === true);

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

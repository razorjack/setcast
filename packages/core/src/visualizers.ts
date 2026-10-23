import { z } from 'zod';
import { FEATURE_SOURCES, HISTORY_SECONDS } from './audio.ts';
import { ConfigError, zodIssues, type Issue } from './errors.ts';
import type { ResolvedProject } from './project.ts';
import { Registry } from './registry.ts';
import { GpuCanvasConfigSchema } from './gpu.ts';

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

/** The theme paints the shapes, or the background art shows through them. */
const FillSchema = z.enum(['theme', 'art'], { error: 'fill must be theme or art.' });

/** Seconds a falling marker holds each level's peak, as on a hi-fi analyzer. 0 draws none. */
const peakSetting = () => numberSetting('peak', 0, 4).default(0);

/** Earlier traces drawn behind the current one, each a wave length older. 0 draws none. */
const trailSetting = () => wholeNumberSetting('trail', 0, 12).default(0);

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
  peak: peakSetting(),
  fill: FillSchema.default('theme'),
})
  .refine((config) => config.style === 'bars' || config.segments === 0, {
    path: ['segments'],
    error: 'segments only applies to style: bars. Remove it, or set style: bars.',
  })
  .refine((config) => config.style === 'bars' || config.peak === 0, {
    path: ['peak'],
    error: 'peak only applies to style: bars. Remove it, or set style: bars.',
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
  fill: FillSchema.default('theme'),
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
  peak: peakSetting(),
});
export type MetersConfig = z.infer<typeof MetersConfigSchema>;

export const OscilloscopeConfigSchema = visualizerSchema('oscilloscope', {
  /** Amplitude scale; the trace clips at the edges of its box. */
  gain: numberSetting('gain', 0.1, 8).default(1),
  trail: trailSetting(),
});
export type OscilloscopeConfig = z.infer<typeof OscilloscopeConfigSchema>;

export const VectorscopeConfigSchema = visualizerSchema('vectorscope', {
  /** Amplitude scale; the trace clips at the edge of its circle. */
  gain: numberSetting('gain', 0.1, 8).default(1),
  trail: trailSetting(),
});
export type VectorscopeConfig = z.infer<typeof VectorscopeConfigSchema>;

export const SpectrogramConfigSchema = visualizerSchema('spectrogram', {
  /** How much of the past scrolls across, newest at the right. */
  seconds: numberSetting('seconds', 1, HISTORY_SECONDS).default(4),
  gain: numberSetting('gain', 0.1, 4).default(1),
  /** The cells take the theme's `color`, or show the art where the music is loud. */
  fill: FillSchema.default('theme'),
});
export type SpectrogramConfig = z.infer<typeof SpectrogramConfigSchema>;

export const FieldConfigSchema = visualizerSchema('field', {
  seed: wholeNumberSetting('seed', 0, 4294967295).default(1),
  speed: numberSetting('speed', 0, 2).default(0.3),
  scale: numberSetting('scale', 0.5, 4).default(1),
  gain: numberSetting('gain', 0.1, 4).default(1),
  ...GpuCanvasConfigSchema.shape,
});
export type FieldConfig = z.infer<typeof FieldConfigSchema>;

const sidesError = 'sides must be 0 for round rings, or a whole number from 3 to 12.';

/** A perspective tunnel of rings and wall spokes that flies toward the viewer. */
export const TunnelConfigSchema = visualizerSchema('tunnel', {
  seed: wholeNumberSetting('seed', 0, 4294967295).default(1),
  /** Depth units travelled per second; each depth unit holds `rings` rings. 0 stops travel. */
  speed: numberSetting('speed', 0, 2).default(0.25),
  /** Ring shape: 0 is a circle, otherwise a regular polygon with this many sides. */
  sides: z
    .number({ error: sidesError })
    .int({ error: sidesError })
    .refine((sides) => sides === 0 || (sides >= 3 && sides <= 12), { error: sidesError })
    .default(6),
  /** Rings per depth unit. */
  rings: wholeNumberSetting('rings', 2, 24).default(6),
  /** Lines along the wall; 0 draws rings only. */
  spokes: wholeNumberSetting('spokes', 0, 48).default(12),
  /** Turns the walls make per depth unit, so the tunnel becomes a vortex. */
  twist: numberSetting('twist', -1, 1).default(0),
  /** Rotation in degrees per second; 0 to pin. */
  spin: numberSetting('spin', -90, 90).default(3),
  gain: numberSetting('gain', 0.1, 4).default(1),
  ...GpuCanvasConfigSchema.shape,
});
export type TunnelConfig = z.infer<typeof TunnelConfigSchema>;

/** Drifting points linked by fading lines, in parallax layers that fly toward the viewer. */
export const ConstellationConfigSchema = visualizerSchema('constellation', {
  seed: wholeNumberSetting('seed', 0, 4294967295).default(1),
  /** Scales drift, orbits, twinkle and flight together. 0 freezes them; audio still responds. */
  speed: numberSetting('speed', 0, 2).default(0.3),
  /** Points across the short side of the frame at mid depth, per layer. */
  density: numberSetting('density', 3, 24).default(7),
  /** How far links reach, in point spacings; 0 draws points only. */
  links: numberSetting('links', 0, 1.5).default(1),
  gain: numberSetting('gain', 0.1, 4).default(1),
  ...GpuCanvasConfigSchema.shape,
});
export type ConstellationConfig = z.infer<typeof ConstellationConfigSchema>;

/** The recent spectrum as stacked lines over the art's relief. */
export const RidgelineConfigSchema = visualizerSchema('ridgeline', {
  /** Lines from the bottom of the box up, the newest at the bottom. */
  lines: wholeNumberSetting('lines', 8, 96).default(44),
  /** How far back the top line is. */
  seconds: numberSetting('seconds', 1, HISTORY_SECONDS).default(6),
  gain: numberSetting('gain', 0.1, 4).default(1),
  /** How far the art's bright parts raise the lines; 0 draws the spectrum alone. */
  relief: numberSetting('relief', 0, 1).default(0.5),
  /** Share of the width the spectrum spans, bass at the art's subject. */
  spread: numberSetting('spread', 0.2, 1).default(0.7),
  /** The theme strokes the lines, or each line takes the art's colors along its row. */
  fill: FillSchema.default('theme'),
});
export type RidgelineConfig = z.infer<typeof RidgelineConfigSchema>;

const bloomBandsError = `bands must be one or two audio features: ${FEATURE_SOURCES.join(', ')}.`;

/** The art's own lights, glowing with the music. */
export const BloomConfigSchema = visualizerSchema('bloom', {
  /**
   * What lights them: the first band lights the lights nearest the art's main hue and the grey
   * ones, the second those nearest its second hue.
   */
  bands: z
    .array(z.enum(FEATURE_SOURCES, { error: bloomBandsError }), { error: bloomBandsError })
    .min(1, { error: bloomBandsError })
    .max(2, { error: bloomBandsError })
    .default(['bass', 'highs']),
  gain: numberSetting('gain', 0.1, 4).default(1),
  /** Share of the art that may count as light, its brightest pixels first. */
  lights: numberSetting('lights', 0.005, 0.3).default(0.05),
  /** How far the glow spreads, as a share of the frame's long side. */
  radius: numberSetting('radius', 0.002, 0.1).default(0.015),
  /** Seconds of trailing average, so the lights swell with the music rather than flicker. */
  smooth: numberSetting('smooth', 0, 2).default(0.1),
});
export type BloomConfig = z.infer<typeof BloomConfigSchema>;

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
  /** Set false only when the component never reads real-time audio or its history. */
  audio?: boolean;
}

export const visualizers = new Registry<VisualizerSpec>('visualizer');

visualizers.add({ name: 'spectrum', schema: SpectrumConfigSchema });
visualizers.add({ name: 'radial', schema: RadialConfigSchema });
visualizers.add({ name: 'meters', schema: MetersConfigSchema });
visualizers.add({ name: 'oscilloscope', schema: OscilloscopeConfigSchema });
visualizers.add({ name: 'vectorscope', schema: VectorscopeConfigSchema });
visualizers.add({ name: 'spectrogram', schema: SpectrogramConfigSchema });
visualizers.add({ name: 'ridgeline', schema: RidgelineConfigSchema });
visualizers.add({ name: 'overview', schema: OverviewConfigSchema, wholeSet: true, audio: false });
visualizers.add({ name: 'bloom', schema: BloomConfigSchema });
visualizers.add({ name: 'field', schema: FieldConfigSchema });
visualizers.add({ name: 'tunnel', schema: TunnelConfigSchema });
visualizers.add({ name: 'constellation', schema: ConstellationConfigSchema });

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

import { z } from 'zod';
import { ProjectConfigSchema } from './config.ts';
import { LiveConfigSchema } from './live.ts';
import { VenueSchema } from './projection.ts';
import { TestPatternPresetSchema } from './test-pattern.ts';
import { TimeSchema } from './time-schema.ts';
import { MidiProfileSchema } from './midi.ts';
import { GpuCanvasConfigSchema } from './gpu.ts';
import { visualizers } from './visualizers.ts';
import { SetcastError } from './errors.ts';

export const CONFIGURATION_SCHEMA_KINDS = [
  'project',
  'live',
  'visualizer',
  'venue',
  'test-pattern',
  'midi',
] as const;
export type ConfigurationSchemaKind = (typeof CONFIGURATION_SCHEMA_KINDS)[number];

/** Authoring schemas describe inputs; runtime loaders still check assets and semantic constraints. */
export function configurationSchema(kind: ConfigurationSchemaKind) {
  const visualizer = visualizerSchema();
  const schemas = {
    project: ProjectConfigSchema.extend({ visualizer: visualizer.optional() }),
    live: LiveConfigSchema.extend({ visualizer: visualizer.optional() }),
    visualizer,
    venue: VenueSchema,
    'test-pattern': TestPatternPresetSchema,
    midi: MidiProfileSchema,
  };
  const schema = schemas[kind];
  if (!Object.hasOwn(schemas, kind))
    throw new SetcastError(
      `Unknown configuration schema "${kind}".`,
      `Choose ${CONFIGURATION_SCHEMA_KINDS.join(', ')}.`,
    );
  return {
    ...z.toJSONSchema(schema, {
      io: 'input',
      target: 'draft-2020-12',
      metadata: descriptions(visualizer),
    }),
    title: `Setcast ${kind} configuration`,
    $comment:
      'Generated from installed Setcast input contracts. Runtime validation additionally checks timecodes, cross-field constraints, timeline references and local assets. Defaults are documentation, not instructions to rewrite a file.',
  };
}

function visualizerSchema() {
  const entries = visualizers.names().map((name) => {
    const schema = visualizers.get(name).schema;
    // Dispatch selects spectrum when name is omitted, regardless of other schemas' defaults.
    return name === 'spectrum'
      ? schema
      : z.intersection(schema, z.object({ name: z.literal(name) }));
  });
  const entry = z.union(entries);
  return z.union([entry, z.array(entry)]);
}

function descriptions(visualizer: z.ZodType) {
  const metadata = z.registry<{ description: string; examples?: unknown[] }>();
  metadata.add(visualizer, {
    description:
      'One visualizer block or an ordered list; [] draws none. Omit visualizer to use the theme default.',
  });
  metadata.add(TimeSchema, {
    description:
      'Nonnegative seconds or MM:SS / H:MM:SS timecode. Fractions are allowed. Runtime validation checks the timecode.',
    examples: [83.5, '1:23.5', '1:02:03'],
  });
  const fields = ProjectConfigSchema.shape;
  for (const [key, description] of Object.entries(PROJECT_DESCRIPTIONS))
    metadata.add(fields[key as keyof typeof fields], { description });
  metadata.add(GpuCanvasConfigSchema.shape.resolution, {
    description:
      'GPU drawing-buffer scale, independent of display pixel density. Half resolution uses one quarter of the pixels.',
  });
  metadata.add(GpuCanvasConfigSchema.shape.recoverySeconds, {
    description:
      'Maximum wall-clock wait for browser graphics restoration. Zero fails immediately; this does not change animation time.',
  });
  metadata.add(LiveConfigSchema.shape.input, {
    description:
      'Initial mixer input selection, stereo routing, gain and delay. Starting capture still requires the operator.',
  });
  metadata.add(LiveConfigSchema.shape.sequence, {
    description:
      'Saved-scene progression settings. Preset directories must exist in the live project.',
  });
  return metadata;
}

const PROJECT_DESCRIPTIONS = {
  title: 'Session title shown by themes.',
  audio: 'Recorded master audio file inside the project directory.',
  background: 'Image or looping video inside the project directory.',
  backgroundFit:
    'Auto lets the theme choose; cover crops to fill; contain preserves the whole image.',
  theme: 'Built-in theme name or a CSS file inside the project directory.',
  css: 'Additional CSS file inside the project directory, appended after the theme.',
  renderer:
    'Offline renderer selection. Remotion remains the default; browser opts into the independent exporter.',
  output: 'Composition dimensions, frame rate and offline encoding settings.',
  clockOffset:
    'Displayed clock offset only. Audio, annotations and render ranges stay clip-relative.',
  clockTotal: 'Displayed total only; does not change audio or render duration.',
  bpm: 'Explicit tempo grid in beats per minute. Speculative beat estimates do not change it.',
  beatOffset: 'Seconds into the audio of a downbeat for the explicit beat/bar grid.',
  branding:
    'Scene-owned logo, identity and rotating messages. Logo assets must stay inside the project.',
  announcements: 'Timed messages that temporarily replace rotating branding messages.',
  scenes: 'Saved live-scene directories recalled at explicit recorded timeline times.',
} as const;

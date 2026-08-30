import { z } from 'zod';
import { DeckSchema, EventSchema, TimeSchema, TrackSchema } from './events.ts';
import { ModRouteSchema } from './modulation.ts';
import { VisualizerConfigSchema } from './visualizers.ts';

/** A path relative to the project directory; `loadProject` checks that it stays inside it. */
const relativePath = (what: string, required = `${what} must be a file path.`) =>
  z.string({ error: required }).min(1, { error: `${what} path cannot be empty.` });

export const TrackEntrySchema = TrackSchema.extend({ time: TimeSchema });
export type TrackEntry = z.infer<typeof TrackEntrySchema>;

const outputShape = {
  width: z
    .number({ error: 'width must be a number of pixels.' })
    .int({ error: 'width must be a whole number of pixels.' })
    .min(16, { error: 'width must be at least 16 pixels.' })
    .default(1920),
  height: z
    .number({ error: 'height must be a number of pixels.' })
    .int({ error: 'height must be a whole number of pixels.' })
    .min(16, { error: 'height must be at least 16 pixels.' })
    .default(1080),
  fps: z
    .union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)], {
      error: 'fps must be 24, 25, 30, 50 or 60.',
    })
    .default(30),
  file: z
    .string({ error: 'file must be an output path ending in .mp4, .mov or .mkv.' })
    .regex(/\.(?:mp4|mov|mkv)$/i, {
      error: 'file must end in .mp4, .mov or .mkv.',
    })
    .default('out/set.mp4'),
  /** x264 constant rate factor: lower is better and bigger. 1-51. */
  crf: z
    .number({ error: 'crf must be a whole number from 1 to 51.' })
    .int({ error: 'crf must be a whole number from 1 to 51.' })
    .min(1, { error: 'crf must be a whole number from 1 to 51.' })
    .max(51, { error: 'crf must be a whole number from 1 to 51.' })
    .default(18),
  /** Quality of the intermediate frames the encoder reads. Dark gradients band below ~90. */
  jpegQuality: z
    .number({ error: 'jpegQuality must be a whole number from 1 to 100.' })
    .int({ error: 'jpegQuality must be a whole number from 1 to 100.' })
    .min(1, { error: 'jpegQuality must be a whole number from 1 to 100.' })
    .max(100, { error: 'jpegQuality must be a whole number from 1 to 100.' })
    .default(95),
};

export const OutputSchema = z.strictObject(outputShape, {
  error: (issue) => unknownOutputKey(issue, Object.keys(outputShape)),
});

export const PanelSchema = z.strictObject({
  /** Seconds the now-playing panel stays up after a track change. 0 keeps it up for the whole set. */
  dwell: z
    .number({ error: 'dwell must be from 0 to 3600 seconds.' })
    .min(0, { error: 'dwell must be from 0 to 3600 seconds.' })
    .max(3600, { error: 'dwell must be from 0 to 3600 seconds.' })
    .default(14),
  /** Seconds it takes to leave once `dwell` is up. */
  fade: z
    .number({ error: 'fade must be from 0 to 60 seconds.' })
    .min(0, { error: 'fade must be from 0 to 60 seconds.' })
    .max(60, { error: 'fade must be from 0 to 60 seconds.' })
    .default(1.2),
});

export const ProjectConfigSchema = z
  .object(
    {
      title: z.string({ error: 'title must be text.' }).default(''),
      audio: relativePath(
        'audio',
        'audio is required: the path to your mix file, e.g. assets/mix.wav.',
      ),
      background: relativePath('background').optional(),
      theme: z
        .string({ error: 'theme must be a built-in name or CSS file path.' })
        .default('sterile-tech'),
      css: relativePath('css').optional(),
      renderer: z
        .literal('remotion', {
          error: 'renderer must be "remotion" (the only renderer in v1).',
        })
        .default('remotion'),
      output: OutputSchema.prefault({}),
      tracks: z.array(TrackEntrySchema, { error: 'tracks must be a YAML list.' }).default([]),
      events: z.array(EventSchema, { error: 'events must be a YAML list.' }).default([]),
      modulation: z.array(ModRouteSchema, { error: 'modulation must be a YAML list.' }).default([]),
      visualizer: VisualizerConfigSchema.prefault({}),
      panel: PanelSchema.prefault({}),
      /** Tempo of the set; gives CSS `--beat` and `--bar`. `setcast analyze --write` fills it in. */
      bpm: z
        .number({ error: 'bpm must be a number greater than 0 and no more than 400.' })
        .positive({ error: 'bpm must be greater than 0.' })
        .max(400, { error: 'bpm must be no more than 400.' })
        .optional(),
      /** Seconds into the audio of a downbeat, so `--bar` lines up with the music. */
      beatOffset: TimeSchema.default(0),
      deckOrder: z
        .array(DeckSchema, { error: 'deckOrder must be a YAML list of decks.' })
        .min(1, { error: 'deckOrder must name at least one deck.' })
        .default(['A', 'B']),
    },
    { error: 'setcast.yaml must be a YAML mapping of keys and values, not a list.' },
  )
  .strict();

function unknownOutputKey(issue: z.core.$ZodRawIssue, keys: string[]): string | undefined {
  if (issue.code !== 'unrecognized_keys') return undefined;
  const unknown = issue.keys[0];
  if (!unknown) return undefined;
  const suggestion = closestKey(unknown, keys);
  return suggestion
    ? `Unrecognized key: "${unknown}". Did you mean "${suggestion}"?`
    : `Unrecognized key: "${unknown}"`;
}

function closestKey(written: string, keys: string[]): string | undefined {
  const ranked = keys.map((key) => [key, editDistance(written, key)] as const);
  const [key, distance] = ranked.toSorted((a, b) => a[1] - b[1])[0]!;
  return distance <= 2 ? key : undefined;
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = row[0]!;
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const above = row[rightIndex]!;
      row[rightIndex] = Math.min(
        above + 1,
        row[rightIndex - 1]! + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return row[right.length]!;
}

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type ProjectConfigInput = z.input<typeof ProjectConfigSchema>;

import { z } from 'zod';
import { DeckSchema, EventSchema, TimeSchema, TrackSchema } from './events.ts';
import { ModRouteSchema } from './modulation.ts';
import { VisualizerConfigSchema } from './visualizers.ts';

/** A path relative to the project directory; `loadProject` checks that it stays inside it. */
const relativePath = (what: string) => z.string().min(1, `${what} path cannot be empty.`);

export const TrackEntrySchema = TrackSchema.extend({ time: TimeSchema });
export type TrackEntry = z.infer<typeof TrackEntrySchema>;

export const OutputSchema = z.object({
  width: z.number().int().min(16).default(1920),
  height: z.number().int().min(16).default(1080),
  fps: z
    .union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)])
    .default(30),
  file: z.string().default('out/set.mp4'),
  /** x264 constant rate factor: lower is better and bigger. 1-51. */
  crf: z.number().int().min(1).max(51).default(18),
  /** Quality of the intermediate frames the encoder reads. Dark gradients band below ~90. */
  jpegQuality: z.number().int().min(1).max(100).default(95),
});

export const PanelSchema = z.object({
  /** Seconds the now-playing panel stays up after a track change. 0 keeps it up for the whole set. */
  dwell: z.number().min(0).max(3600).default(14),
  /** Seconds it takes to leave once `dwell` is up. */
  fade: z.number().min(0).max(60).default(1.2),
});

export const ProjectConfigSchema = z
  .object({
    title: z.string().default(''),
    audio: relativePath('audio'),
    background: relativePath('background').optional(),
    theme: z.string().default('sterile-tech'),
    css: relativePath('css').optional(),
    renderer: z
      .literal('remotion', {
        error: 'renderer must be "remotion" (the only renderer in v1).',
      })
      .default('remotion'),
    output: OutputSchema.prefault({}),
    tracks: z.array(TrackEntrySchema).default([]),
    events: z.array(EventSchema).default([]),
    modulation: z.array(ModRouteSchema).default([]),
    visualizer: VisualizerConfigSchema.prefault({}),
    panel: PanelSchema.prefault({}),
    /** Tempo of the set; gives CSS `--beat` and `--bar`. `setcast analyze --write` fills it in. */
    bpm: z.number().positive().max(400).optional(),
    /** Seconds into the audio of a downbeat, so `--bar` lines up with the music. */
    beatOffset: TimeSchema.default(0),
    deckOrder: z.array(DeckSchema).min(1).default(['A', 'B']),
  })
  .strict();

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type ProjectConfigInput = z.input<typeof ProjectConfigSchema>;

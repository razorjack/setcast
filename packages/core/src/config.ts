import { z } from 'zod';
import { DeckSchema, EventSchema, TimeSchema, TrackSchema } from './events.ts';
import { ModRouteSchema } from './modulation.ts';

const relativePath = (what: string) =>
  z
    .string()
    .min(1, `${what} path cannot be empty.`)
    .refine(
      (p) => !p.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(p) && !p.split(/[\\/]/).includes('..'),
      {
        message: `${what} must be a path inside the project directory (e.g. "assets/mix.wav"), not an absolute path or "..".`,
      },
    );

export const TrackEntrySchema = TrackSchema.extend({ time: TimeSchema });
export type TrackEntry = z.infer<typeof TrackEntrySchema>;

export const OutputSchema = z.object({
  width: z.number().int().min(16).default(1920),
  height: z.number().int().min(16).default(1080),
  fps: z
    .union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)])
    .default(30),
  file: z.string().default('out/set.mp4'),
});

export const VisualizerConfigSchema = z.object({ name: z.string().default('spectrum') }).loose();

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
    deckOrder: z.array(DeckSchema).min(1).default(['A', 'B']),
  })
  .strict();

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type ProjectConfigInput = z.input<typeof ProjectConfigSchema>;

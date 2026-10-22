import { z } from 'zod';
import { LiveConfigSchema } from './live.ts';
import { ProjectConfigSchema } from './config.ts';

export const SceneSelectionSchema = z.strictObject(
  {
    theme: z
      .string({ error: 'selection.theme must name a theme offered by the player.' })
      .min(1, { error: 'selection.theme is empty. Choose a theme offered by the player.' }),
    credits: z
      .enum(['panels', 'tracklist', 'both'], {
        error: 'selection.credits must be panels, tracklist, both or null.',
      })
      .nullable()
      .optional(),
    art: z.enum(['project', 'none', 'file'], {
      error: 'selection.art must be project, none or file.',
    }),
    artwork: z.string({ error: 'selection.artwork must be the uploaded artwork path.' }).optional(),
    title: z
      .string({ error: 'selection.title must be text.' })
      .max(500, { error: 'selection.title exceeds 500 characters. Shorten the title.' })
      .optional(),
    clock: z.boolean({ error: 'selection.clock must be true or false.' }).optional(),
    input: LiveConfigSchema.shape.input.optional(),
    bpm: ProjectConfigSchema.shape.bpm.unwrap().nullable().optional(),
    beatOffset: ProjectConfigSchema.shape.beatOffset.removeDefault().optional(),
  },
  { error: 'Scene selection contains unknown settings. Use the player controls to save a scene.' },
);

export type SceneSelection = z.infer<typeof SceneSelectionSchema>;

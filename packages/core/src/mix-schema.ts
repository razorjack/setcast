import { z } from 'zod';
import { parseTime } from './time.ts';

export const text = z
  .string({ error: 'Use nonempty text.' })
  .min(1, { error: 'Use nonempty text.' });
export const IdSchema = text.refine((id) => !id.startsWith('$'), {
  error: 'The $ prefix is reserved for generated IDs; choose another ID.',
});
export const NamespaceSchema = text.regex(/^[^:]+:[^:]+$/, {
  error: 'Use a namespaced name such as my-plugin:cue.',
});
export const ExtensionsSchema = z.record(NamespaceSchema, z.json());
const evidence = z.array(IdSchema, { error: 'Use a list of source IDs.' }).optional();
const extensions = ExtensionsSchema.optional();
const tags = z.array(text, { error: 'Use a list of nonempty labels.' }).optional();
const ids = z
  .array(text, { error: 'Use a list of play IDs.' })
  .refine((names) => new Set(names).size === names.length, {
    error: 'Each play ID must occur only once; remove duplicate references.',
  });
const targets = ids.min(1, { error: 'Name at least one play.' });
export const ScopeSchema = z.union([z.literal('mix'), z.strictObject({ plays: targets })], {
  error: 'Use mix or {plays: [play-id]} for scope.',
});
export type Scope = z.infer<typeof ScopeSchema>;

export function microseconds(seconds: number): number {
  const time = Math.round(seconds * 1_000_000);
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isSafeInteger(time)) {
    throw new RangeError(
      `Time ${seconds} must be finite, nonnegative and within safe microsecond precision.`,
    );
  }
  return time;
}

export const MixTimeSchema = z
  .union([z.number(), z.string()], {
    error: 'Use nonnegative seconds or a timecode such as 1:23.5.',
  })
  .transform((written, ctx) => {
    const seconds = parseTime(written);
    if (seconds === null || !Number.isSafeInteger(Math.round(seconds * 1_000_000))) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid time ${JSON.stringify(written)}; use finite nonnegative seconds or M:SS / H:MM:SS with components below 60.`,
      });
      return z.NEVER;
    }
    return microseconds(seconds);
  });
const normalizedTime = z
  .number({ error: 'Use integer microseconds.' })
  .int({ error: 'Use safe integer microseconds.' })
  .nonnegative({ error: 'Time must be nonnegative.' });
const end = z.union([z.literal('end'), MixTimeSchema], {
  error: 'Use a time or end; offline intervals require a finite end.',
});
const metadata = {
  title: text,
  artist: text.optional(),
  label: text.optional(),
  version: text.optional(),
  evidence,
  extensions,
};
export const RecordingInputSchema = z.strictObject(metadata);
const intervalMetadata = {
  deck: text.optional(),
  tail: z.literal(true, { error: 'Omit tail when unspecified, or use tail: true.' }).optional(),
  parts: tags,
  tags,
  evidence,
  extensions,
};
export const ContributionInputSchema = z.strictObject({
  id: IdSchema.optional(),
  from: MixTimeSchema,
  until: end,
  ...intervalMetadata,
});
export const PlayInputSchema = z
  .strictObject({
    id: IdSchema.optional(),
    recording: IdSchema.optional(),
    ...metadata,
    title: text.optional(),
    at: MixTimeSchema.optional(),
    until: end.optional(),
    contributions: z
      .array(ContributionInputSchema)
      .min(1, { error: 'Add at least one contribution interval.' })
      .optional(),
    background: text.optional(),
  })
  .superRefine((play, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });
    if (play.recording !== undefined) {
      for (const key of ['title', 'artist', 'label', 'version', 'evidence'] as const) {
        if (play[key] !== undefined)
          issue(
            key,
            `${key} conflicts with recording ${play.recording}; put metadata in recordings or remove recording.`,
          );
      }
    } else if (play.title === undefined)
      issue(
        'title',
        'A recording needs a title; supply title or reference recordings with recording.',
      );
    if (play.contributions !== undefined && play.until !== undefined)
      issue(
        'until',
        'until conflicts with contributions; put the end on each contribution and remove the row-level until.',
      );
    if (play.contributions === undefined && play.at === undefined)
      issue('at', 'Supply at for fallback participation or a nonempty contributions list.');
  });

export const SECTION_KINDS = ['drop', 'breakdown', 'buildup'] as const;
export const ANNOTATION_KINDS = [
  ...SECTION_KINDS,
  'section_end',
  'rewind',
  'technique',
  'note',
] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

const annotationStamp = {
  scope: ScopeSchema.default('mix'),
  participants: targets.optional(),
  tags,
  evidence,
  extensions,
};
function annotationSchema<S extends z.ZodRawShape>(
  time: typeof MixTimeSchema | typeof normalizedTime,
  identity: S,
) {
  const stamp = { ...annotationStamp, ...identity, at: time };
  return z.union(
    [
      z.strictObject({
        ...stamp,
        kind: z.literal('drop'),
        intensity: z.number().min(0).max(1).default(1),
      }),
      z.strictObject({
        ...stamp,
        kind: z.enum(['breakdown', 'buildup', 'section_end', 'rewind']),
      }),
      z.strictObject({
        ...stamp,
        kind: z.literal('technique'),
        until: time.optional(),
        tags: z.array(text).min(1, { error: 'A technique requires at least one descriptive tag.' }),
      }),
      z.strictObject({ ...stamp, kind: z.literal('note'), until: time.optional(), text }),
      z.strictObject({ ...stamp, kind: NamespaceSchema, until: time.optional(), data: z.json() }),
    ],
    {
      error:
        'Use drop, breakdown, buildup, section_end, rewind, technique with tags, note with text, or a namespaced kind with JSON data. Check fields for this kind.',
    },
  );
}
function validateScope(
  annotation: { scope: Scope; participants?: string[] },
  ctx: z.RefinementCtx,
): void {
  if (annotation.scope !== 'mix' && annotation.participants !== undefined)
    ctx.addIssue({
      code: 'custom',
      path: ['participants'],
      message: 'participants requires scope: mix; remove participants or use mix scope.',
    });
}
export const AnnotationInputSchema = annotationSchema(MixTimeSchema, {
  id: IdSchema.optional(),
}).superRefine(validateScope);
const AnnotationSchema = annotationSchema(normalizedTime, {
  id: text,
  order: normalizedTime,
}).superRefine(validateScope);
export type Annotation = z.infer<typeof AnnotationSchema>;
export const SourcesSchema = z.record(
  IdSchema,
  z.strictObject({
    title: text,
    url: z.url({ error: 'Use a complete source URL.' }).optional(),
    note: text.optional(),
  }),
);
export const MixInputShape = {
  version: z.literal(1, { error: 'Unsupported mix version; use version: 1.' }).default(1),
  recordings: z.record(IdSchema, RecordingInputSchema).default({}),
  plays: z.array(PlayInputSchema, { error: 'plays must be a list.' }).default([]),
  annotations: z.array(AnnotationInputSchema).default([]),
  focus: z
    .array(z.strictObject({ id: IdSchema.optional(), at: MixTimeSchema, plays: ids }))
    .default([]),
  chapters: z.array(z.strictObject({ at: MixTimeSchema, title: text })).optional(),
  sources: SourcesSchema.default({}),
  extensions,
};
export const MixInputSchema = z.strictObject(MixInputShape);
export type MixInput = z.infer<typeof MixInputSchema>;
export type MixAuthoring = z.input<typeof MixInputSchema>;
const OriginSchema = z.strictObject({
  kind: z.enum(['authored', 'listing', 'next_listing', 'mix_end']),
  path: text,
});
export const MixDocumentSchema = z.strictObject({
  version: z.literal(1),
  duration: normalizedTime.positive(),
  recordings: z.array(z.strictObject({ id: text, ...metadata })),
  plays: z.array(
    z.strictObject({
      id: text,
      recording: text,
      order: normalizedTime,
      background: text.optional(),
      extensions,
    }),
  ),
  contributions: z.array(
    z.strictObject({
      id: text,
      play: text,
      from: normalizedTime,
      until: normalizedTime,
      origins: z.strictObject({ from: OriginSchema, until: OriginSchema }),
      ...intervalMetadata,
    }),
  ),
  listings: z.array(
    z.strictObject({ id: text, at: normalizedTime, play: text, order: normalizedTime }),
  ),
  annotations: z.array(AnnotationSchema),
  focus: z.array(z.strictObject({ id: text, at: normalizedTime, plays: ids })),
  chapters: z.array(z.strictObject({ at: normalizedTime, title: text })),
  sources: SourcesSchema,
  extensions,
});
export type MixDocument = Omit<z.infer<typeof MixDocumentSchema>, 'annotations'> & {
  annotations: Annotation[];
};
export type Recording = MixDocument['recordings'][number];
export type Play = MixDocument['plays'][number];
export type Contribution = MixDocument['contributions'][number];
export type Listing = MixDocument['listings'][number];
export type Origin = Contribution['origins']['from'];

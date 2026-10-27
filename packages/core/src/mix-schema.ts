import { z } from 'zod';
import { microseconds, parseTime } from './time.ts';

function object<S extends z.ZodRawShape>(shape: S) {
  return z.strictObject(shape, {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? `Unknown keys ${issue.keys.join(', ')}; remove them or use a namespaced extensions field.`
        : 'Use a YAML mapping with the documented fields.',
  });
}
const json = z.json({
  error:
    'Use JSON values with finite numbers; functions and non-finite values cannot be serialized.',
});

export const text = z
  .string({ error: 'Use nonempty text.' })
  .min(1, { error: 'Use nonempty text.' });
export const IdSchema = text.refine((id) => !id.startsWith('$'), {
  error: 'The $ prefix is reserved for generated IDs; choose another ID.',
});
export const NamespaceSchema = text
  .regex(/^[^:]+:[^:]+$/, {
    error: 'Use a namespaced name such as my-plugin:cue.',
  })
  .transform((name) => name as `${string}:${string}`);
export const ExtensionsSchema = z.record(NamespaceSchema, json);
const evidence = z.array(IdSchema, { error: 'Use a list of source IDs.' }).optional();
const extensions = ExtensionsSchema.optional();
const tags = z.array(text, { error: 'Use a list of nonempty labels.' }).optional();
const ids = z
  .array(text, { error: 'Use a list of play IDs.' })
  .refine((names) => new Set(names).size === names.length, {
    error: 'Each play ID must occur only once; remove duplicate references.',
  });
const targets = ids.min(1, { error: 'Name at least one play.' });
export const ScopeSchema = z.union([z.literal('mix'), object({ plays: targets })], {
  error: 'Use mix or {plays: [play-id]} for scope.',
});
export type Scope = z.infer<typeof ScopeSchema>;

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
export const RecordingInputSchema = object(metadata);
const intervalMetadata = {
  deck: text.optional(),
  tail: z.literal(true, { error: 'Omit tail when unspecified, or use tail: true.' }).optional(),
  parts: tags,
  tags,
  evidence,
  extensions,
};
export const ContributionInputSchema = object({
  id: IdSchema.optional(),
  from: MixTimeSchema,
  until: end,
  ...intervalMetadata,
});
export const PlayInputSchema = object({
  id: IdSchema.optional(),
  recording: IdSchema.optional(),
  ...metadata,
  title: text.optional(),
  at: MixTimeSchema.optional(),
  until: end.optional(),
  contributions: z
    .array(ContributionInputSchema, { error: 'Use a nonempty list of contribution intervals.' })
    .min(1, { error: 'Add at least one contribution interval.' })
    .optional(),
  background: text.optional(),
}).superRefine((play, ctx) => {
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
function annotationSchema<S extends z.ZodRawShape, E extends z.ZodType<number | 'end'>>(
  time: typeof MixTimeSchema | typeof normalizedTime,
  identity: S,
  spanEnd: E,
) {
  const stamp = { ...annotationStamp, ...identity, at: time };
  return z.union(
    [
      object({
        ...stamp,
        kind: z.literal('drop'),
        intensity: z
          .number({ error: 'Use intensity from 0 to 1.' })
          .min(0, { error: 'Use intensity from 0 to 1.' })
          .max(1, { error: 'Use intensity from 0 to 1.' })
          .default(1),
      }),
      object({
        ...stamp,
        kind: z.enum(['breakdown', 'buildup', 'section_end', 'rewind']),
      }),
      object({
        ...stamp,
        kind: z.literal('technique'),
        until: spanEnd.optional(),
        tags: z
          .array(text, { error: 'Use a list of descriptive technique tags.' })
          .min(1, { error: 'A technique requires at least one descriptive tag.' }),
      }),
      object({ ...stamp, kind: z.literal('note'), until: spanEnd.optional(), text }),
      object({ ...stamp, kind: NamespaceSchema, until: spanEnd.optional(), data: json }),
    ],
    {
      error: annotationError,
    },
  );
}
function annotationError(issue: z.core.$ZodRawIssue): string {
  const written = issue.input as { kind?: unknown } | undefined;
  const kind = written?.kind;
  const branches: Record<string, number> = {
    drop: 0,
    breakdown: 1,
    buildup: 1,
    section_end: 1,
    rewind: 1,
    technique: 2,
    note: 3,
  };
  const branch =
    typeof kind === 'string' ? (branches[kind] ?? (kind.includes(':') ? 4 : undefined)) : undefined;
  if (issue.code === 'invalid_union' && branch !== undefined) {
    const details = issue.errors[branch]
      ?.map((problem) => `${problem.path.join('.') || String(kind)}: ${problem.message}`)
      .join('; ');
    return `${JSON.stringify(written)}: ${details}. Section cues and rewind are moments; only technique, note and custom kinds accept until.`;
  }
  return `Unknown annotation ${JSON.stringify(written)}; use drop, breakdown, buildup, section_end, rewind, technique with tags, note with text, or a namespaced kind with JSON data.`;
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
function validateAuthoredTargets(
  annotation: { scope: Scope; participants?: string[] },
  ctx: z.RefinementCtx,
): void {
  const names =
    annotation.scope === 'mix' ? (annotation.participants ?? []) : annotation.scope.plays;
  if (names.some((id) => id.startsWith('$')))
    ctx.addIssue({
      code: 'custom',
      message:
        'References cannot use reserved generated IDs; give each referenced play an authored id and use it.',
    });
}
export const AnnotationInputSchema = annotationSchema(
  MixTimeSchema,
  {
    id: IdSchema.optional(),
  },
  end,
)
  .superRefine(validateScope)
  .superRefine(validateAuthoredTargets);
const AnnotationSchema = annotationSchema(
  normalizedTime,
  {
    id: text,
    order: normalizedTime,
  },
  normalizedTime,
).superRefine(validateScope);
export type Annotation = z.infer<typeof AnnotationSchema>;
export const SourcesSchema = z.record(
  IdSchema,
  object({
    title: text,
    url: z.url({ error: 'Use a complete source URL.' }).optional(),
    note: text.optional(),
  }),
);
export const MixInputShape = {
  version: z.literal(1, { error: 'Unsupported mix version; use version: 1.' }).default(1),
  recordings: z
    .record(IdSchema, RecordingInputSchema, {
      error: 'Use recordings: {recording-id: {title: Title}}.',
    })
    .default({}),
  plays: z.array(PlayInputSchema, { error: 'plays must be a list.' }).default([]),
  annotations: z
    .array(AnnotationInputSchema, { error: 'Use a list of annotations with at and kind.' })
    .default([]),
  focus: z
    .array(
      object({
        id: IdSchema.optional(),
        at: MixTimeSchema,
        plays: ids.refine((names) => names.every((id) => !id.startsWith('$')), {
          error:
            'References cannot use reserved generated IDs; give each referenced play an authored id.',
        }),
      }),
    )
    .default([]),
  chapters: z
    .array(object({ at: MixTimeSchema, title: text }), {
      error: 'Use a list of chapters with at and title, or [] to disable chapters.',
    })
    .optional(),
  sources: SourcesSchema.default({}),
  extensions,
};
export const MixInputSchema = object(MixInputShape);
export type MixInput = z.infer<typeof MixInputSchema>;
export type MixAuthoring = z.input<typeof MixInputSchema>;
const OriginSchema = object({
  kind: z.enum(['authored', 'listing', 'next_listing', 'mix_end']),
  path: text,
});
export const MixDocumentSchema = object({
  version: z.literal(1, { error: 'Unsupported mix version; use version: 1.' }),
  duration: normalizedTime.positive({ error: 'Use a positive mix duration in microseconds.' }),
  recordings: z.array(object({ id: text, ...metadata })),
  plays: z.array(
    object({
      id: text,
      recording: text,
      order: normalizedTime,
      background: text.optional(),
      extensions,
    }),
  ),
  contributions: z.array(
    object({
      id: text,
      play: text,
      from: normalizedTime,
      until: normalizedTime,
      origins: object({ from: OriginSchema, until: OriginSchema }),
      ...intervalMetadata,
    }),
  ),
  listings: z.array(object({ id: text, at: normalizedTime, play: text, order: normalizedTime })),
  annotations: z.array(AnnotationSchema),
  focus: z.array(object({ id: text, at: normalizedTime, plays: ids })),
  chapters: z.array(object({ at: normalizedTime, title: text })),
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

export type FocusDirective = MixDocument['focus'][number];
export type EvidenceSource = MixDocument['sources'][string];

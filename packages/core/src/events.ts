import { z } from 'zod';
import { parseTime } from './time.ts';

export const TimeSchema = z
  .union([z.number(), z.string()], {
    error: 'Time must be seconds (83.5) or a timecode ("1:23").',
  })
  .transform((written, ctx) => {
    const seconds = parseTime(written);
    if (seconds === null) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid time "${written}". Use seconds (83.5) or a timecode ("1:23", "1:23.5", "1:02:03").`,
      });
      return z.NEVER;
    }
    return seconds;
  });

export const DeckSchema = z
  .string({ error: 'Deck must be a single capital letter: A, B, C or D.' })
  .regex(/^[A-D]$/, { error: 'Deck must be a single capital letter: A, B, C or D.' });

export const TrackSchema = z.strictObject({
  title: z
    .string({ error: 'Track title must be text.' })
    .min(1, { error: 'Track title cannot be empty. Use "ID" for unknown tracks.' }),
  artist: z.string({ error: 'Track artist must be text.' }).default('ID'),
  label: z.string({ error: 'Track label must be text.' }).optional(),
  deck: DeckSchema.optional(),
  /** This track's own background image or video, replacing `background:` while it plays. */
  background: z
    .string({ error: 'Track background must be a file path.' })
    .min(1, { error: 'Track background path cannot be empty.' })
    .optional(),
});
export type Track = z.infer<typeof TrackSchema>;

/** `id` is unread today; live mode will use it to correct or delete an event already logged. */
const eventSchema = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.strictObject({
    type: z.literal(type),
    time: TimeSchema,
    id: z.string({ error: 'Event id must be text.' }).optional(),
    ...shape,
  });

const intensity = z
  .number({ error: 'intensity is 0..1.' })
  .min(0, { error: 'intensity is 0..1.' })
  .max(1, { error: 'intensity is 0..1.' })
  .default(1);

const eventOptions = [
  eventSchema('track_start', TrackSchema.shape),
  eventSchema('drop', { intensity, deck: DeckSchema.optional() }),
  eventSchema('double_drop', { intensity }),
  eventSchema('breakdown', { deck: DeckSchema.optional() }),
  eventSchema('buildup', { deck: DeckSchema.optional() }),
  eventSchema('rewind', {}),
  eventSchema('switch', { deck: DeckSchema }),
  eventSchema('chapter', {
    title: z
      .string({ error: 'Chapter title must be text.' })
      .min(1, { error: 'Chapter title cannot be empty.' }),
  }),
] as const;

const eventTypes = eventOptions.map((option) => option.shape.type.value);

export const EventSchema = z.discriminatedUnion('type', eventOptions, {
  error: (issue) => {
    const written = (issue.input as { type?: unknown } | null)?.type;
    return typeof written === 'string'
      ? `Unknown event type "${written}". Types: ${eventTypes.join(', ')}.`
      : `Event type is required. Types: ${eventTypes.join(', ')}.`;
  },
});

export type SetEvent = z.infer<typeof EventSchema>;
export type EventType = SetEvent['type'];
export type EventOf<T extends EventType> = Extract<SetEvent, { type: T }>;

export const EVENT_TYPES = [...eventTypes] as EventType[];

/** Events that begin a section. The latest one before `time` defines `EventState.section`. */
export const SECTION_TYPES = ['drop', 'double_drop', 'breakdown', 'buildup'] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const sortEvents = (events: readonly SetEvent[]): SetEvent[] =>
  events.toSorted((a, b) => a.time - b.time);

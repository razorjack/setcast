import { z } from 'zod';
import { parseTime } from './time.ts';

export const TimeSchema = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const t = parseTime(v);
  if (t === null) {
    ctx.addIssue({
      code: 'custom',
      message: `Invalid time "${v}". Use seconds (83.5) or a timecode ("1:23", "1:23.5", "1:02:03").`,
    });
    return z.NEVER;
  }
  return t;
});

export const DeckSchema = z
  .string()
  .regex(/^[A-D]$/, 'Deck must be a single capital letter: A, B, C or D.');

export const TrackSchema = z.strictObject({
  title: z.string().min(1, 'Track title cannot be empty. Use "ID" for unknown tracks.'),
  artist: z.string().default('ID'),
  label: z.string().optional(),
  deck: DeckSchema.optional(),
  /** This track's own background image or video, replacing `background:` while it plays. */
  background: z.string().optional(),
});
export type Track = z.infer<typeof TrackSchema>;

/** `id` is unread today; live mode will use it to correct or delete an event already logged. */
const event = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.strictObject({ type: z.literal(type), time: TimeSchema, id: z.string().optional(), ...shape });

const intensity = z.number().min(0).max(1).default(1);

export const EventSchema = z.discriminatedUnion('type', [
  event('track_start', TrackSchema.shape),
  event('drop', { intensity, deck: DeckSchema.optional() }),
  event('double_drop', { intensity }),
  event('breakdown', { deck: DeckSchema.optional() }),
  event('buildup', { deck: DeckSchema.optional() }),
  event('rewind', {}),
  event('switch', { deck: DeckSchema }),
  event('chapter', { title: z.string().min(1, 'Chapter title cannot be empty.') }),
]);

export type SetEvent = z.infer<typeof EventSchema>;
export type EventType = SetEvent['type'];
export type EventOf<T extends EventType> = Extract<SetEvent, { type: T }>;

export const EVENT_TYPES = EventSchema.options.map((o) => o.shape.type.value) as EventType[];

/** Events that begin a section. The latest one before `time` defines `EventState.section`. */
export const SECTION_TYPES = ['drop', 'double_drop', 'breakdown', 'buildup'] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const sortEvents = (events: readonly SetEvent[]): SetEvent[] =>
  events.toSorted((a, b) => a.time - b.time);

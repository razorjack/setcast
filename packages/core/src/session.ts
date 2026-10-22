import { z } from 'zod';

const sampleError =
  'Journal sample must be a nonnegative safe integer. Keep the original capture sample positions.';
const sample = z
  .number({ error: sampleError })
  .int({ error: sampleError })
  .nonnegative({ error: sampleError });
const textError =
  'Journal text must contain 1 to 500 characters. Restore the complete original entry.';
const text = z
  .string({ error: textError })
  .min(1, { error: textError })
  .max(500, { error: textError });
const entryError = { error: 'Journal entry has unknown fields. Use the version 1 session format.' };
const rateError =
  'Journal sampleRate must be an integer from 8000 to 384000 Hz. Use the capture sample rate.';
export const SessionHeaderSchema = z.strictObject(
  {
    type: z.literal('session', { error: 'The first journal line must have type: session.' }),
    version: z.literal(1, {
      error: 'Unsupported journal version. This Setcast version reads version: 1.',
    }),
    sampleRate: z
      .number({ error: rateError })
      .int({ error: rateError })
      .min(8000, { error: rateError })
      .max(384000, { error: rateError }),
    captureId: text,
    startedAt: z.iso.datetime({
      error: 'Journal startedAt must be an ISO UTC timestamp, e.g. 2026-10-22T10:00:00Z.',
    }),
    originSample: sample,
  },
  entryError,
);
const eventType = <T extends string>(value: T) =>
  z.literal(value, { error: `Journal event type must be ${value}.` });
export const SessionEventSchema = z.discriminatedUnion(
  'type',
  [
    z.strictObject(
      {
        type: eventType('credit'),
        sample,
        title: text,
        artist: z.string({ error: textError }).max(500, { error: textError }).optional(),
      },
      entryError,
    ),
    z.strictObject(
      {
        type: eventType('cue'),
        sample,
        kind: z.enum(['drop', 'breakdown', 'buildup', 'rewind', 'section_end'], {
          error: 'Journal cue kind must be drop, breakdown, buildup, rewind or section_end.',
        }),
      },
      entryError,
    ),
    z.strictObject({ type: eventType('scene'), sample, preset: text }, entryError),
    z.strictObject({ type: eventType('end'), sample }, entryError),
  ],
  { error: 'Journal event type must be credit, cue, scene or end.' },
);
export type SessionHeader = z.infer<typeof SessionHeaderSchema>;
export type SessionEvent = z.infer<typeof SessionEventSchema>;

export function readSession(text: string): { header: SessionHeader; events: SessionEvent[] } {
  const lines = text.trim().split('\n');
  let header: SessionHeader;
  try {
    header = SessionHeaderSchema.parse(JSON.parse(lines[0]!));
  } catch (cause) {
    throw new Error(
      'Invalid journal header on line 1. Restore the complete version 1 session header.',
      { cause },
    );
  }
  const events = lines.slice(1).map((line, index) => {
    try {
      return SessionEventSchema.parse(JSON.parse(line));
    } catch (cause) {
      throw new Error(
        `Invalid journal line ${index + 2}. Restore a complete journal line before replaying.`,
        { cause },
      );
    }
  });
  let previous = 0;
  let ended = false;
  for (const event of events) {
    if (ended || event.sample < previous)
      throw new Error(
        'Journal events are out of order or follow an end event. Use one ordered capture session per journal.',
      );
    previous = event.sample;
    ended = event.type === 'end';
  }
  return { header, events };
}

/** Offset is master time at session sample zero, independent of the live visual delay. */
export function replayEvents(
  header: SessionHeader,
  events: SessionEvent[],
  offset: number,
  duration: number,
) {
  if (!Number.isFinite(offset) || !Number.isFinite(duration) || duration <= 0)
    throw new Error('Replay needs a finite offset and positive recorded duration.');
  const plays: { at: number; title: string; artist?: string }[] = [];
  const annotations: { at: number; kind: string }[] = [];
  const scenes: { at: number; preset: string }[] = [];
  for (const event of events) {
    const at = event.sample / header.sampleRate + offset;
    if (at >= duration) continue;
    if (event.type === 'credit') {
      replaceAt(plays, at);
      plays.push({ at: Math.max(0, at), title: event.title, artist: event.artist || undefined });
    }
    if (event.type === 'scene') {
      replaceAt(scenes, at);
      scenes.push({ at: Math.max(0, at), preset: event.preset });
    }
    if (event.type === 'cue' && at >= 0) annotations.push({ at, kind: event.kind });
  }
  return { plays, annotations, scenes };
}

function replaceAt(entries: { at: number }[], at: number) {
  if (at < 0) entries.length = 0;
  if (entries.at(-1)?.at === Math.max(0, at)) entries.pop();
}

import { z } from 'zod';

export const MIDI_ACTIONS = [
  'intensity',
  'brightness',
  'blackout',
  'branding',
  'messages',
  'scene-1',
  'scene-2',
  'scene-3',
  'scene-4',
  'scene-5',
  'scene-6',
  'scene-7',
  'scene-8',
] as const;
export type MidiAction = (typeof MIDI_ACTIONS)[number];
export interface MidiMessage {
  kind: 'note' | 'cc';
  channel: number;
  number: number;
  value: number;
}

const MidiKeySchema = z
  .string()
  .regex(/^(?:note|cc):(?:[1-9]|1[0-6]):(?:0|[1-9]\d?|1[01]\d|12[0-7])$/, {
    error:
      'Use note:channel:number or cc:channel:number, with channel 1–16 and number 0–127 (no leading zeros).',
  });
const mappingRecord = z
  .record(
    MidiKeySchema,
    z.enum(MIDI_ACTIONS, {
      error:
        'Choose intensity, brightness, blackout, branding, messages or scene-1 through scene-8.',
    }),
  )
  .refine((mapping) => Object.keys(mapping).length <= 256, {
    error: 'Use at most 256 MIDI mappings in one profile.',
  });
// Zod records omit __proto__; reject it before that omission can hide an invalid authoring key.
export const MidiMappingSchema = z.intersection(
  mappingRecord,
  z
    .unknown()
    .refine((input) => !input || typeof input !== 'object' || !Object.hasOwn(input, '__proto__'), {
      error: 'Unsupported MIDI mapping key __proto__.',
    }),
);
export type MidiMapping = z.infer<typeof MidiMappingSchema>;
export const MidiConfigSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, { error: 'Give the MIDI profile a nonempty name.' })
    .max(80, { error: 'Keep the MIDI profile name to 80 characters.' })
    .default('MIDI controls'),
  mapping: MidiMappingSchema,
});
export type MidiConfig = z.infer<typeof MidiConfigSchema>;
export const MidiProfileSchema = MidiConfigSchema.extend({
  version: z.literal(1, {
    error: 'Unsupported MIDI profile. Import a version 1 profile exported by Setcast.',
  }),
});
export type MidiProfile = z.infer<typeof MidiProfileSchema>;

export const DEFAULT_MIDI: Readonly<MidiMapping> = Object.freeze({
  'cc:1:1': 'intensity',
  'cc:1:7': 'brightness',
  'note:1:44': 'blackout',
  'note:1:45': 'branding',
  'note:1:46': 'messages',
  'note:1:36': 'scene-1',
  'note:1:37': 'scene-2',
  'note:1:38': 'scene-3',
  'note:1:39': 'scene-4',
  'note:1:40': 'scene-5',
  'note:1:41': 'scene-6',
  'note:1:42': 'scene-7',
  'note:1:43': 'scene-8',
});

/** Only note-on and control-change messages drive mappings; note-off and clock are ignored. */
export function midiMessage(bytes: ArrayLike<number>): MidiMessage | null {
  if (bytes.length < 3) return null;
  const [status, number, velocity] = [bytes[0]!, bytes[1]!, bytes[2]!];
  if (
    ![status, number, velocity].every(Number.isInteger) ||
    status < 128 ||
    status > 255 ||
    number < 0 ||
    number > 127 ||
    velocity < 0 ||
    velocity > 127
  )
    return null;
  const kind = status & 0xf0;
  if (kind !== 0x90 && kind !== 0xb0) return null;
  if (kind === 0x90 && velocity === 0) return null;
  return {
    kind: kind === 0x90 ? 'note' : 'cc',
    channel: (status & 0x0f) + 1,
    number,
    value: velocity / 127,
  };
}
export const midiKey = (message: MidiMessage) =>
  `${message.kind}:${message.channel}:${message.number}`;

/** Learning preserves the existing one-control-per-action behavior; authored mappings may share actions. */
export function learnMidiMapping(
  mapping: MidiMapping,
  key: string,
  action: MidiAction,
): MidiMapping {
  MidiKeySchema.parse(key);
  z.enum(MIDI_ACTIONS).parse(action);
  return MidiMappingSchema.parse(
    Object.fromEntries([
      ...Object.entries(mapping).filter(([entry, target]) => entry !== key && target !== action),
      [key, action],
    ]),
  );
}

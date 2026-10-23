import { expect, test } from 'vite-plus/test';
import {
  DEFAULT_MIDI,
  MidiConfigSchema,
  MidiMappingSchema,
  MidiProfileSchema,
  learnMidiMapping,
  midiMessage,
  midiKey,
} from './midi.ts';
import { MidiControlBuffer } from './midi-buffer.ts';

test('MIDI channel decoding rejects malformed bytes, note-off and clock', () => {
  for (const data of [
    [],
    [0xf8],
    [0x80, 36, 127],
    [0x90, 36, 0],
    [0xa0, 36, 127],
    [0x190, 36, 127],
    [0x90, -1, 127],
    [0x90, 128, 127],
    [0x90, 1.5, 127],
    [0x90, 1, NaN],
    [0x90, 1, 128],
  ])
    expect(midiMessage(data)).toBeNull();
  expect(midiMessage([0x9f, 127, 64])).toEqual({
    kind: 'note',
    channel: 16,
    number: 127,
    value: 64 / 127,
  });
  const message = midiMessage({ length: 3, 0: 0xb2, 1: 7, 2: 127 })!;
  expect(midiKey(message)).toBe('cc:3:7');
  expect(message.value).toBe(1);
});

test('profiles validate canonical keys, finite actions, version and intentional empty mappings', () => {
  expect(MidiMappingSchema.parse(DEFAULT_MIDI)).toEqual(DEFAULT_MIDI);
  expect(MidiConfigSchema.parse({ mapping: {} })).toEqual({ name: 'MIDI controls', mapping: {} });
  expect(
    MidiProfileSchema.parse({ version: 1, name: ' Booth ', mapping: { 'cc:16:127': 'blackout' } })
      .name,
  ).toBe('Booth');
  for (const key of [
    'cc:0:1',
    'note:17:1',
    'cc:1:128',
    'cc:1:01',
    'cc:01:1',
    'clock:1:0',
    '__proto__',
  ])
    expect(MidiMappingSchema.safeParse({ [key]: 'brightness' }).success).toBe(false);
  expect(MidiMappingSchema.safeParse({ 'cc:1:7': 'scene-9' }).success).toBe(false);
  for (const input of [
    { version: 2, mapping: {} },
    { version: 1, mapping: {}, name: ' ' },
    { version: 1, mapping: {}, surprise: 1 },
  ])
    expect(MidiProfileSchema.safeParse(input).success).toBe(false);
});

test('learning replaces conflicting keys/actions without mutating input or exceeding the bound', () => {
  const mapping = { ...DEFAULT_MIDI };
  const learned = learnMidiMapping(mapping, 'cc:2:8', 'brightness');
  expect(learned['cc:1:7']).toBeUndefined();
  expect(learned['cc:2:8']).toBe('brightness');
  expect(mapping).toEqual(DEFAULT_MIDI);
  const full = Object.fromEntries(
    Array.from({ length: 256 }, (_, index) => [
      `cc:${1 + Math.floor(index / 128)}:${index % 128}`,
      'brightness' as const,
    ]),
  );
  expect(MidiMappingSchema.safeParse(full).success).toBe(true);
  expect(() => learnMidiMapping(full, 'note:1:1', 'blackout')).toThrow('at most 256');
});

test('continuous controls coalesce while CC switches dispatch once per rising edge', () => {
  const controls = new MidiControlBuffer();
  const mapping = { 'cc:1:7': 'brightness' as const, 'cc:1:44': 'blackout' as const };
  for (const value of [1, 40, 80])
    expect(controls.push(midiMessage([0xb0, 7, value])!, mapping)).toBeNull();
  expect(controls.flush(mapping)).toEqual([{ action: 'brightness', value: 80 / 127 }]);
  expect(controls.flush(mapping)).toEqual([]);
  expect(controls.push(midiMessage([0xb0, 44, 127])!, mapping)?.action).toBe('blackout');
  expect(controls.push(midiMessage([0xb0, 44, 127])!, mapping)).toBeNull();
  expect(controls.push(midiMessage([0xb0, 44, 0])!, mapping)).toBeNull();
  expect(controls.push(midiMessage([0xb0, 44, 127])!, mapping)?.action).toBe('blackout');
});

test('mapping replacement and reset discard buffered values and old button edges', () => {
  const controls = new MidiControlBuffer();
  const original = { 'cc:1:7': 'brightness' as const, 'cc:1:44': 'blackout' as const };
  controls.push(midiMessage([0xb0, 7, 127])!, original);
  controls.push(midiMessage([0xb0, 44, 127])!, original);
  const replacement = { ...original, 'cc:1:44': 'branding' as const };
  expect(controls.flush(replacement)).toEqual([]);
  expect(controls.push(midiMessage([0xb0, 44, 127])!, replacement)?.action).toBe('branding');
  controls.push(midiMessage([0xb0, 7, 127])!, replacement);
  controls.reset();
  expect(controls.flush(replacement)).toEqual([]);
});

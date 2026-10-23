import { expect, test } from 'vite-plus/test';
import { DEFAULT_MIDI } from '@setcast/core';
import { readMidiProfile } from './midi-profile.ts';

const storage = (entries: Record<string, string>) => ({
  getItem: (key: string) => entries[key] ?? null,
});
test('profile storage uses current format, migrates valid legacy maps and handles unavailable storage', () => {
  const current = { version: 1, name: 'Booth', mapping: { 'cc:2:7': 'brightness' } };
  expect(
    readMidiProfile(storage({ 'setcast-midi-profile-v1': JSON.stringify(current) })).config,
  ).toEqual(current);
  const legacy = { 'note:1:44': 'blackout' };
  expect(
    readMidiProfile(storage({ 'setcast-midi-v1': JSON.stringify(legacy) })).config.mapping,
  ).toEqual(legacy);
  expect(
    readMidiProfile(
      storage({ 'setcast-midi-profile-v1': '{broken', 'setcast-midi-v1': JSON.stringify(legacy) }),
    ).config.mapping,
  ).toEqual(legacy);
  expect(
    readMidiProfile(storage({ 'setcast-midi-v1': '{"cc:1:999":"brightness"}' })).config.mapping,
  ).toEqual(DEFAULT_MIDI);
  expect(
    readMidiProfile({
      getItem() {
        throw new Error('unavailable');
      },
    }).config.mapping,
  ).toEqual(DEFAULT_MIDI);
});

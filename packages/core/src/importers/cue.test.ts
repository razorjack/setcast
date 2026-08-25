import { expect, test } from 'vite-plus/test';
import { cueImporter } from './cue.ts';
import { plainImporter } from './plain.ts';

const sheet = `
PERFORMER "Some DJ"
TITLE "Sterile Session 01"
FILE "mix.wav" WAVE
  TRACK 01 AUDIO
    TITLE "Stigma"
    PERFORMER "Noisia"
    INDEX 01 00:00:00
  TRACK 02 AUDIO
    TITLE "ID"
    INDEX 00 03:44:00
    INDEX 01 03:45:30
  TRACK 03 AUDIO
    PERFORMER "Phace"
    TITLE "Thick Lips"
    INDEX 01 67:10:00
`;

test('cue sheets: INDEX 01 is the start, frames are 1/75 s, set-level fields are skipped', () => {
  expect(cueImporter.test(sheet)).toBe(true);
  expect(plainImporter.test(sheet)).toBe(false);
  expect(cueImporter.parse(sheet)).toEqual([
    { time: 0, artist: 'Noisia', title: 'Stigma' },
    { time: 225.4, artist: 'ID', title: 'ID' },
    { time: 4030, artist: 'Phace', title: 'Thick Lips' },
  ]);
});

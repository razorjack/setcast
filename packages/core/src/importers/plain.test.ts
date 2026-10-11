import { expect, test } from 'vite-plus/test';
import { plainImporter } from './plain.ts';

test('parses common plain-text tracklist shapes', () => {
  const text = `
My Set – 2026
00:00 Noisia - Stigma
[03:45] ID - ID
2. 07:10 Phace – Thick Lips [Neosignal]
1:02:03 - Untitled Closer
just a note line
`;
  expect(plainImporter.test(text)).toBe(true);
  expect(plainImporter.parse(text)).toEqual([
    { at: 0, artist: 'Noisia', title: 'Stigma' },
    { at: 225, artist: 'ID', title: 'ID' },
    { at: 430, artist: 'Phace', title: 'Thick Lips', label: 'Neosignal' },
    { at: 3723, artist: undefined, title: 'Untitled Closer' },
  ]);
});

test('rejects text without timecodes', () => {
  expect(plainImporter.test('hello\nworld')).toBe(false);
  expect(plainImporter.parse('hello')).toEqual([]);
});

test('imports long sets and rejects malformed timestamped lines without dropping credits', () => {
  expect(plainImporter.parse('100:00 Artist - Late\n120:00 Finale').map((play) => play.at)).toEqual(
    [6000, 7200],
  );
  expect(() => plainImporter.parse('00:00 First\n100:99 Broken')).toThrow('line 2: 100:99 Broken');
  expect(() => plainImporter.parse('01:20')).toThrow('Invalid tracklist entry');
});

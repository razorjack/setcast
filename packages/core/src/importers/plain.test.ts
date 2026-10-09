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

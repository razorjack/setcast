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
    { time: 0, artist: 'Noisia', title: 'Stigma' },
    { time: 225, artist: 'ID', title: 'ID' },
    { time: 430, artist: 'Phace', title: 'Thick Lips', label: 'Neosignal' },
    { time: 3723, artist: 'ID', title: 'Untitled Closer' },
  ]);
});

test('rejects text without timecodes', () => {
  expect(plainImporter.test('hello\nworld')).toBe(false);
  expect(plainImporter.parse('hello')).toEqual([]);
});

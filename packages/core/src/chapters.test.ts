import { expect, test } from 'vite-plus/test';
import { chapterProblems, chapters } from './chapters.ts';
import type { SetEvent } from './events.ts';

test('chapters list tracks and chapter events, forcing the first to 00:00', () => {
  expect(
    chapters([
      { type: 'track_start', time: 2, title: 'Stigma', artist: 'Noisia' },
      { type: 'chapter', time: 3600, title: 'Second hour' },
      { type: 'drop', time: 60, intensity: 1 },
      { type: 'track_start', time: 225, title: 'ID', artist: 'ID' },
    ]),
  ).toEqual(['00:00 Noisia - Stigma', '03:45 ID - ID', '01:00:00 Second hour']);
});

test('chapterProblems reports what would turn YouTube chapters off', () => {
  const short: SetEvent[] = [
    { type: 'track_start', time: 0, title: 'One', artist: 'A' },
    { type: 'track_start', time: 6, title: 'Two', artist: 'B' },
    { type: 'track_start', time: 300, title: 'Three', artist: 'C' },
  ];
  expect(chapterProblems(short)).toEqual([
    expect.stringContaining('"A - One" runs 6s'),
  ] satisfies unknown[]);

  expect(chapterProblems(short.slice(0, 2))).toEqual([
    expect.stringContaining('Only 2 chapters'),
    expect.stringContaining('runs 6s'),
  ] satisfies unknown[]);

  const spaced = short.map((e, i) => ({ ...e, time: i * 150 }));
  expect(chapterProblems(spaced)).toEqual([]);
});

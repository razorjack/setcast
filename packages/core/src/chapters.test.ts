import { expect, test } from 'vite-plus/test';
import { chapters } from './chapters.ts';

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

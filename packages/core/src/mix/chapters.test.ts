import { expect, test } from 'vite-plus/test';
import { chapterProblems, chapters } from './chapters.ts';
import { normalizeMix } from './mix.ts';

test('chapter export preserves custom times and explicit disabling', () => {
  const mix = normalizeMix(
    {
      chapters: [
        { at: 2, title: 'Intro' },
        { at: 225, title: 'Guest mix' },
        { at: 3600, title: 'Second hour' },
      ],
    },
    4000,
  );
  expect(chapters(mix)).toEqual(['00:02 Intro', '03:45 Guest mix', '01:00:00 Second hour']);
  expect(chapterProblems(mix)[0]).toMatch(/first chapter.*00:00/);
  expect(chapters(normalizeMix({ plays: [{ at: 0, title: 'Track' }], chapters: [] }, 300))).toEqual(
    [],
  );
});
test('platform validation checks rounded export times and the final chapter', () => {
  const mix = normalizeMix(
    {
      plays: [
        { at: 0, title: 'One' },
        { at: 6, title: 'Two' },
        { at: 300, title: 'Three' },
      ],
    },
    305,
  );
  expect(chapterProblems(mix)).toEqual([
    expect.stringContaining('"One" runs 6s'),
    expect.stringContaining('"Three" runs 5s'),
  ]);
});

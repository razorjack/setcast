import { expect, test } from 'vite-plus/test';
import { readSession, replayEvents, type SessionHeader, type SessionEvent } from './journal.ts';

const header: SessionHeader = {
  type: 'session',
  version: 1,
  sampleRate: 48000,
  captureId: 'capture',
  originSample: 96000,
  startedAt: '2026-10-22T10:00:00Z',
};
test('journal replay maps sample positions to the master and carries state across a trimmed start', () => {
  const events: SessionEvent[] = [
    { type: 'scene', sample: 0, preset: 'first' },
    { type: 'credit', sample: 0, title: 'Before' },
    { type: 'credit', sample: 48000, title: 'Current' },
    { type: 'cue', sample: 96000, kind: 'drop' },
    { type: 'scene', sample: 144000, preset: 'second' },
    { type: 'end', sample: 240000 },
  ];
  const replay = replayEvents(header, events, -1.5, 2);
  expect(replay.plays).toEqual([{ at: 0, title: 'Current', artist: undefined }]);
  expect(replay.annotations).toEqual([{ at: 0.5, kind: 'drop' }]);
  expect(replay.scenes).toEqual([
    { at: 0, preset: 'first' },
    { at: 1.5, preset: 'second' },
  ]);
});
test('journal parsing rejects unordered, incomplete and post-end entries', () => {
  const encode = (...events: unknown[]) =>
    [header, ...events].map((entry) => JSON.stringify(entry)).join('\n');
  expect(() =>
    readSession(encode({ type: 'end', sample: 2 }, { type: 'cue', sample: 3, kind: 'drop' })),
  ).toThrow('follow an end');
  expect(() =>
    readSession(
      encode({ type: 'cue', sample: 2, kind: 'drop' }, { type: 'cue', sample: 1, kind: 'rewind' }),
    ),
  ).toThrow('out of order');
  expect(() => readSession(encode() + '\n{"type":')).toThrow('line 2');
});

test('manual updates at one sample keep the final scene and credit', () => {
  const replay = replayEvents(
    header,
    [
      { type: 'scene', sample: 0, preset: 'first' },
      { type: 'scene', sample: 0, preset: 'final' },
      { type: 'credit', sample: 0, title: 'Typo' },
      { type: 'credit', sample: 0, title: 'Corrected' },
    ],
    0,
    1,
  );
  expect(replay.scenes).toEqual([{ at: 0, preset: 'final' }]);
  expect(replay.plays).toEqual([{ at: 0, title: 'Corrected', artist: undefined }]);
});

test('announcements replay on the master, end early and keep their part inside it', () => {
  const replay = replayEvents(
    header,
    [
      { type: 'announcement', sample: 0, text: 'Started early', seconds: 3 },
      { type: 'announcement', sample: 240000, text: 'Last track', seconds: 30 },
      { type: 'announcement_end', sample: 336000 },
      { type: 'announcement', sample: 480000, text: 'Too late', seconds: 5 },
    ],
    -1,
    9,
  );
  expect(replay.announcements).toEqual([
    { at: 0, text: 'Started early', seconds: 2 },
    { at: 4, text: 'Last track', seconds: expect.closeTo(2.6) },
  ]);
  const encode = (event: unknown) =>
    [header, event].map((entry) => JSON.stringify(entry)).join('\n');
  expect(() =>
    readSession(encode({ type: 'announcement', sample: 0, text: '', seconds: 5 })),
  ).toThrow('line 2');
});

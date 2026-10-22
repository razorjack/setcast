import { expect, test, vi } from 'vite-plus/test';
import { SequenceSchema } from '@setcast/core';
import { LiveSequence } from './sequence.ts';

function fixture(loop = true) {
  const waiting: ReturnType<typeof Promise.withResolvers<boolean>>[] = [];
  const recall = vi.fn(() => {
    const completion = Promise.withResolvers<boolean>();
    waiting.push(completion);
    return completion.promise;
  });
  const report = vi.fn();
  const sequence = new LiveSequence(
    {
      loop,
      scenes: [
        { preset: 'saved-scene-a', seconds: 5 },
        { preset: 'saved-scene-b', seconds: 10 },
      ],
    },
    { recall, report, cancel: vi.fn(), changed: vi.fn() },
  );
  return { sequence, waiting, recall, report };
}

test('dwell begins after readiness and includes only available running capture time', async () => {
  const { sequence, waiting, recall } = fixture();
  sequence.start(null);
  sequence.tick(0, true);
  sequence.tick(100, true);
  expect(recall).toHaveBeenCalledTimes(1);
  waiting[0]!.resolve(true);
  await Promise.resolve();
  sequence.tick(100, true);
  sequence.tick(103, true);
  sequence.tick(110, false);
  sequence.tick(120, false);
  sequence.tick(121, true);
  expect(sequence.elapsed).toBe(4);
  sequence.hold();
  sequence.tick(200, true);
  sequence.start('saved-scene-a');
  sequence.tick(210, true);
  sequence.tick(211, true);
  expect(recall).toHaveBeenLastCalledWith('saved-scene-b');
  sequence.tick(1000, true);
  expect(recall).toHaveBeenCalledTimes(2);
  waiting[1]!.resolve(true);
  await Promise.resolve();
  expect(sequence.elapsed).toBe(0);
  expect(sequence.index).toBe(1);
});

test('non-looping sequence holds at the end and explicitly starts again', async () => {
  const { sequence, waiting, recall } = fixture(false);
  sequence.start('saved-scene-b');
  sequence.tick(0, true);
  sequence.tick(10, true);
  expect(sequence.running).toBe(false);
  sequence.start('saved-scene-b');
  expect(recall).toHaveBeenCalledWith('saved-scene-a');
  waiting[0]!.resolve(true);
  await Promise.resolve();
  expect(sequence.index).toBe(0);
});

test('looping, manual skip, failed recall and stale completion stay bounded', async () => {
  const { sequence, waiting, recall, report } = fixture();
  sequence.start('saved-scene-b');
  sequence.next();
  sequence.next();
  expect(recall).toHaveBeenCalledTimes(1);
  expect(recall).toHaveBeenLastCalledWith('saved-scene-a');
  waiting[0]!.resolve(false);
  await Promise.resolve();
  expect(sequence.running).toBe(false);
  expect(sequence.index).toBe(1);
  expect(report).not.toHaveBeenCalled();
  sequence.start('saved-scene-b');
  sequence.next();
  sequence.configure([{ preset: 'saved-scene-c', seconds: 30 }], false);
  waiting[1]!.resolve(true);
  await Promise.resolve();
  expect(sequence.pending).toBe(false);
  expect(sequence.index).toBe(-1);
  expect(sequence.running).toBe(false);
});

test('sequence configuration rejects unsafe presets, unbounded dwell and empty lists', () => {
  expect(() => SequenceSchema.parse({ scenes: [] })).toThrow(/at least one scene/);
  expect(() => SequenceSchema.parse({ scenes: [{ preset: '../scene', seconds: 5 }] })).toThrow(
    /without slashes/,
  );
  expect(() => SequenceSchema.parse({ scenes: [{ preset: 'saved-scene-a', seconds: 0 }] })).toThrow(
    /at least 5/,
  );
  expect(SequenceSchema.parse({ scenes: [{ preset: 'saved-scene-a' }] })).toEqual({
    scenes: [{ preset: 'saved-scene-a', seconds: 60 }],
    loop: true,
  });
});

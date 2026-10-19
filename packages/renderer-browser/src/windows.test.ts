import { SILENCE, type AudioAnalyzer } from '@setcast/core';
import { expect, test, vi } from 'vite-plus/test';
import { AnalysisWindows } from './windows.ts';
import { copyPcm } from './browser/decode.ts';

const analyzer = (index: number): AudioAnalyzer => ({
  featuresAt: () => ({ ...SILENCE, bass: index / 100 }),
});

test('prefetch keeps current history available and decoded retention stays bounded across a long set', async () => {
  const load = vi.fn(async (index: number) => analyzer(index));
  const windows = new AnalysisWindows(load);
  await windows.prepare(0);
  await windows.prefetch(4, 3600);
  expect(load).toHaveBeenCalledTimes(1);
  await windows.prefetch(5, 3600);
  expect(windows.at(0)).not.toBeNull();
  expect(windows.at(10)).not.toBeNull();
  for (let index = 2; index < 360; index++) {
    await windows.prepare(index * 10);
    expect(windows.size).toBe(2);
  }
  expect(windows.at(0)).toBeNull();
  await windows.prepare(0);
  expect(windows.at(0)?.featuresAt(0).bass).toBe(0);
  expect(windows.size).toBe(2);
  windows.dispose();
  expect(windows.size).toBe(0);
});

test('prefetch after a backward seek retains the current cached window', async () => {
  const windows = new AnalysisWindows(async (index) => analyzer(index));
  await windows.prepare(10);
  await windows.prepare(50);
  const current = windows.at(15);
  await windows.prefetch(15, 100);
  expect(windows.at(15)).toBe(current);
  expect(windows.at(20)).not.toBeNull();
  expect(windows.at(50)).toBeNull();
});

test('rapid seeks cancel stale decodes, share equal requests and run at most one decoder', async () => {
  const calls: number[] = [];
  let finish = () => {};
  const load = vi.fn(async (index: number, signal: AbortSignal) => {
    calls.push(index);
    if (index === 0)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    signal.throwIfAborted();
    return analyzer(index);
  });
  const windows = new AnalysisWindows(load);
  const first = windows.prepare(0);
  expect(windows.prepare(1)).toBe(first);
  await Promise.resolve();
  const obsolete = windows.prepare(200);
  const latest = windows.prepare(400);
  expect(calls).toEqual([0]);
  finish();
  await Promise.all([first, obsolete, latest]);
  expect(calls).toEqual([0, 40]);
  expect(windows.at(0)).toBeNull();
  expect(windows.at(400)).not.toBeNull();
});

test('decode failures can retry and disposal prevents an in-flight result from being retained', async () => {
  let finish = (_analyzer: AudioAnalyzer) => {};
  const load = vi
    .fn<() => Promise<AudioAnalyzer>>()
    .mockRejectedValueOnce(new Error('broken file'))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const windows = new AnalysisWindows(load);
  await expect(windows.prepare(0)).rejects.toThrow('broken file');
  const pending = windows.prepare(0);
  await Promise.resolve();
  windows.dispose();
  finish(analyzer(0));
  await pending;
  expect(windows.size).toBe(0);
  await windows.prepare(20);
  expect(load).toHaveBeenCalledTimes(2);
});

test('PCM copies use absolute packet placement, trim edges and leave timestamp gaps silent', () => {
  const target = new Float32Array(8);
  copyPcm(target, Float32Array.of(1, 2, 3, 4), -2);
  copyPcm(target, Float32Array.of(5, 6, 7), 6);
  copyPcm(target, Float32Array.of(9), 10);
  expect([...target]).toEqual([3, 4, 0, 0, 0, 0, 5, 6]);
});

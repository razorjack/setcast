import { expect, test } from 'vite-plus/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BeatTracker } from '../../packages/core/src/index.ts';
import { parseEvaluation, type EvaluationCase } from './config.ts';
import { OnsetComparison } from './onsets.ts';
import { StereoPcmBytes } from './source.ts';
import { createMetrics, gridError, observe } from './metrics.ts';
import { evaluate } from './run.ts';

const input = { id: 'pulse', source: { pattern: 'pulse' }, seconds: 24 };
const config = (entry = input) => parseEvaluation({ version: 1, cases: [entry] });

test('evaluation configuration distinguishes unknown labels, forbidden locks and explicit grids', () => {
  expect(config().cases[0]!.reference).toBeUndefined();
  expect(
    parseEvaluation({ version: 1, cases: [{ ...input, reference: null }] }).cases[0]!.reference,
  ).toBe(null);
  for (const invalid of [
    { ...input, surprise: true },
    { ...input, at: 0.005 },
    { ...input, seconds: 5 },
    { ...input, source: { file: 'x.wav', pattern: 'pulse' } },
    { ...input, reference: [{ from: 10, until: 5, bpm: 120, beatOffset: 0 }] },
  ])
    expect(() => parseEvaluation({ version: 1, cases: [invalid] })).toThrow();
  expect(() => parseEvaluation({ version: 1, cases: [input, input] })).toThrow('unique');
  expect(() =>
    parseEvaluation({ version: 1, methods: ['energy', 'energy'], cases: [input] }),
  ).toThrow('unique');
});

test('onset baseline matches hop RMS and multiband candidates preserve antiphase stereo energy', () => {
  const same = new OnsetComparison(12, true);
  const opposite = new OnsetComparison(12, true);
  const outputs = [];
  for (const value of [0.5, 1, 0]) {
    for (let sample = 0; sample < 160; sample++) {
      const a = same.push(value, value);
      const b = opposite.push(value, -value);
      expect(a).toEqual(b);
      if (a) outputs.push(a);
    }
  }
  expect(outputs.map((onset) => onset.hop)).toEqual([1201, 1202, 1203]);
  expect(outputs[0]!.values.energy).toBeCloseTo(Math.log1p(50), 12);
  expect(outputs[1]!.values.energy).toBeCloseTo(Math.log1p(100) - Math.log1p(50), 12);
  expect(outputs[2]!.values.energy).toBe(0);
  expect(() => same.push(NaN, 0)).toThrow('non-finite');
});

test('stream decoder preserves channel order across every possible partial stereo frame', () => {
  const bytes = Buffer.alloc(32);
  const expected = [0.25, -0.5, 1, -1, 0, 0.75, -0.25, 0.5];
  expected.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  for (let split = 1; split < bytes.length; split++) {
    const reader = new StereoPcmBytes();
    const result = [
      ...reader.push(bytes.subarray(0, split)),
      ...reader.push(bytes.subarray(split)),
    ];
    reader.finish();
    expect(result).toEqual(expected);
  }
  const incomplete = new StereoPcmBytes();
  incomplete.push(bytes.subarray(0, 7));
  expect(() => incomplete.finish()).toThrow('incomplete');
});

function locked() {
  const tracker = new BeatTracker();
  for (let hop = 1; hop <= 1200; hop++) tracker.push({ hop, value: hop % 50 === 17 ? 1 : 0 });
  expect(tracker.state).toBe('locked');
  return tracker;
}

test('metrics never score unlabeled audio as correct and count phase mistakes despite correct BPM', () => {
  const tracker = locked();
  const entry = config().cases[0]!;
  const unknown = createMetrics();
  expect(observe(unknown, tracker, 12, entry).classification).toBe('unlabeled');
  expect(unknown.locked).toBe(1);
  expect(unknown.labeled).toBe(0);
  const absent = createMetrics();
  observe(absent, tracker, 12, { ...entry, reference: null });
  expect(absent.falseLocks).toBe(1);
  const grid = { from: 0, until: 24, bpm: 120, beatOffset: 0.17 };
  expect(gridError(tracker.estimate!, grid, 12).phase).toBeLessThan(0.01);
  const shifted = createMetrics();
  observe(shifted, tracker, 12, { ...entry, reference: [{ ...grid, beatOffset: 0.42 }] });
  expect(shifted.phaseErrors).toBe(1);
  expect(shifted.tempoErrors).toBe(0);
  const warmup = createMetrics();
  observe(warmup, tracker, 9.5, { ...entry, reference: null });
  expect(warmup.eligible).toBe(0);
});

test('complete synthetic evaluation writes reproducible observations with bounded tracker history', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setcast-beat-evaluation-'));
  const entry: EvaluationCase = {
    ...config().cases[0]!,
    reference: [{ from: 0, until: 24, bpm: 120, beatOffset: 0.17 }],
  };
  try {
    const result = await evaluate(
      entry,
      ['energy', 'bands', 'bass', 'spectral'],
      join(root, 'observations.jsonl'),
    );
    expect(result.frames).toBe(24 * 16000);
    for (const method of result.methods) {
      expect(method.correctLocks).toBeGreaterThan(20);
      expect(method.falseLocks).toBe(0);
      expect(method.maxRetainedHops).toBe(800);
    }
    const lines = (await readFile(join(root, 'observations.jsonl'), 'utf8')).trim().split('\n');
    expect(lines).toHaveLength(24 * 2 * 4);
    expect(JSON.parse(lines.at(-1)!).at).toBe(24);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

import { expect, test } from 'vite-plus/test';
import {
  AutomationSchema,
  DEFAULT_PERFORMANCE,
  nextBar,
  performanceAnalyzer,
  performanceAt,
} from './performance.ts';
import { SILENCE } from './audio.ts';
import { replayEvents, type SessionHeader } from './session.ts';

const from = DEFAULT_PERFORMANCE;
const to = { intensity: 2, brightness: 0 };
test('performance ramps are random-access, replaceable and validated', () => {
  const first = { at: 2, from, to, duration: 2 };
  const events = [
    first,
    { at: 3, from: { intensity: 1.5, brightness: 0.5 }, to: from, duration: 1 },
  ];
  expect(performanceAt(from, events, 4)).toEqual(from);
  expect(performanceAt(from, events, 2.5)).toEqual({ intensity: 1.25, brightness: 0.75 });
  expect(performanceAt(from, events, 3.5)).toEqual({ intensity: 1.25, brightness: 0.75 });
  expect(performanceAt(from, events, 0)).toBe(from);
  expect(performanceAt(from, [], 100)).toBe(from);
  expect(performanceAt(from, [...events, { at: 3, from, to, duration: 0 }], 3)).toEqual(to);
  expect(() => AutomationSchema.parse([...events].reverse())).toThrow('ordered by at');
  expect(() => AutomationSchema.parse([{ ...first, to: { ...to, brightness: 2 } }])).toThrow(
    'brightness',
  );
  expect(nextBar(2.1, 120, 0)).toBe(4);
  expect(nextBar(2, 120, 0)).toBe(2);
  expect(nextBar(2.1, null, 0)).toBe(2.1);
});

test('visual intensity preserves raw input and scales history and signed waveforms', () => {
  const audio = {
    ...SILENCE,
    bass: 0.8,
    bins: [0.2, 0.8],
    wave: { left: [-0.8, 0.8], right: [-0.2, 0.2] },
  };
  const analyzer = { featuresAt: () => audio };
  expect(performanceAnalyzer(analyzer, 1)).toBe(analyzer);
  const scaled = performanceAnalyzer(analyzer, 2).featuresAt(1);
  expect(scaled.bass).toBe(1);
  expect(scaled.bins).toEqual([0.4, 1]);
  expect(scaled.wave.left).toEqual([-1, 1]);
  expect(audio.bass).toBe(0.8);
  expect(audio.wave.left).toEqual([-0.8, 0.8]);
});

test('trimmed replay resumes the remaining part of a ramp', () => {
  const header: SessionHeader = {
    type: 'session',
    version: 1,
    sampleRate: 48000,
    captureId: 'test',
    originSample: 0,
    startedAt: '2026-10-22T10:00:00Z',
  };
  const replay = replayEvents(
    header,
    [{ type: 'performance', sample: 0, from, to, duration: 2 }],
    -1,
    5,
  );
  expect(replay.automation).toEqual([
    { at: 0, from: { intensity: 1.5, brightness: 0.5 }, to, duration: 1 },
  ]);
  expect(performanceAt(from, replay.automation, 0.5)).toEqual({
    intensity: 1.75,
    brightness: 0.25,
  });
});

import { describe, expect, test } from 'vite-plus/test';
import { readEnduranceConfig } from './config.ts';

describe('endurance workload configuration', () => {
  test('loads versioned defaults and rejects ambiguous workload values before browser work', () => {
    const config = readEnduranceConfig({ version: 1, mode: 'live' });
    expect(config.scenes).toHaveLength(3);
    expect(config.seconds).toBe(3600);
    expect(() => readEnduranceConfig({ version: 2, mode: 'live' })).toThrow('version must be 1');
    expect(() => readEnduranceConfig({ version: 1, mode: 'unknown' })).toThrow(
      'mode must be live or export',
    );
    expect(() => readEnduranceConfig({ version: 1, mode: 'live', second: 10 })).toThrow(
      'Unknown endurance setting second',
    );
    for (const seconds of [null, -1, 0, NaN, Infinity, '30', 86401])
      expect(() => readEnduranceConfig({ version: 1, mode: 'live', seconds })).toThrow(
        'Endurance seconds=',
      );
    expect(() => readEnduranceConfig({ version: 1, mode: 'export', concurrency: 1.5 })).toThrow(
      'Use an integer',
    );
  });

  test('accepts declarative scenes but does not read assets from unrelated directories', () => {
    const scene = { theme: 'sterile-tech', visualizer: { name: 'tunnel', sides: 0 } };
    expect(
      readEnduranceConfig({ version: 1, mode: 'live', scenes: [scene] }).scenes[0]?.visualizer,
    ).toEqual(scene.visualizer);
    expect(() => readEnduranceConfig({ version: 1, mode: 'live', scenes: [] })).toThrow('1 to 16');
    expect(() =>
      readEnduranceConfig({
        version: 1,
        mode: 'live',
        scenes: [{ ...scene, theme: './custom.css' }],
      }),
    ).toThrow('is not built in');
    expect(() =>
      readEnduranceConfig({
        version: 1,
        mode: 'live',
        scenes: [{ ...scene, background: '../art.png' }],
      }),
    ).toThrow('references external assets');
  });
});

test('GPU recovery injection is opt-in, bounded and live-only', () => {
  expect(readEnduranceConfig({ version: 1, mode: 'live' }).gpuRecovery).toBeNull();
  expect(readEnduranceConfig({ version: 1, mode: 'live', gpuRecovery: {} }).gpuRecovery).toEqual({
    everySeconds: 60,
    restoreSeconds: 0.5,
  });
  for (const gpuRecovery of [false, [], { everySeconds: 0 }, { restoreSeconds: 16 }, { delay: 1 }])
    expect(() => readEnduranceConfig({ version: 1, mode: 'live', gpuRecovery })).toThrow();
  expect(() => readEnduranceConfig({ version: 1, mode: 'export', gpuRecovery: {} })).toThrow(
    'only available in live',
  );
});

test('decoded export verification is explicit and export-only', () => {
  expect(readEnduranceConfig({ version: 1, mode: 'export' }).verification).toBe('metadata');
  expect(
    readEnduranceConfig({ version: 1, mode: 'export', verification: 'decoded' }).verification,
  ).toBe('decoded');
  expect(() => readEnduranceConfig({ version: 1, mode: 'export', verification: true })).toThrow(
    'metadata or decoded',
  );
  expect(() => readEnduranceConfig({ version: 1, mode: 'live', verification: 'decoded' })).toThrow(
    'only available in export',
  );
});

test('audio checkpoints are explicit bounded output-relative times', () => {
  const base = { version: 1, mode: 'export', verification: 'decoded' };
  expect(readEnduranceConfig({ ...base, audioAt: [1, 50, 100] }).audioAt).toEqual([1, 50, 100]);
  for (const audioAt of [[], [0], [NaN], ['1'], Array(65).fill(1)])
    expect(() => readEnduranceConfig({ ...base, audioAt })).toThrow('1–64');
  expect(() => readEnduranceConfig({ ...base, verification: 'metadata', audioAt: [1] })).toThrow(
    'verification: decoded',
  );
});

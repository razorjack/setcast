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

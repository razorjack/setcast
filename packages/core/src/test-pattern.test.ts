import { describe, expect, test } from 'vite-plus/test';
import { TestPatternSchema, TestPatternPresetSchema, testPatternPhase } from './test-pattern.ts';

describe('output test patterns', () => {
  test('validates declarative settings and portable versioned presets', () => {
    const config = TestPatternSchema.parse({ pattern: 'detail', detailSize: 1 });
    expect(config).toEqual({
      pattern: 'detail',
      detailSize: 1,
      level: 1,
      speed: 0.1,
      safeArea: 0.1,
    });
    expect(TestPatternPresetSchema.parse({ version: 1, testPattern: config }).testPattern).toEqual(
      config,
    );
    expect(() => TestPatternPresetSchema.parse({ version: 2, testPattern: {} })).toThrow(
      'version 1',
    );
    expect(() => TestPatternSchema.parse({ pattern: 'strobe' })).toThrow(
      'alignment, grayscale, detail or motion',
    );
    expect(() => TestPatternSchema.parse({ detailSize: 0.5 })).toThrow('whole number');
    expect(() => TestPatternSchema.parse({ level: 2 })).toThrow('at most 1');
    expect(() => TestPatternSchema.parse({ speed: -1 })).toThrow('cannot be negative');
    expect(() => TestPatternSchema.parse({ safeArea: 0.4 })).toThrow('at most 0.25');
  });

  test('motion is bounded, seekable and still advances after eight hours', () => {
    for (const speed of [0, 0.05, 0.1, 0.5, 1]) {
      const times = [28800, 1, 20, 0, 28800 + 1 / 30];
      const phases = times.map((time) => testPatternPhase(time, speed));
      expect(times.map((time) => testPatternPhase(time, speed))).toEqual(phases);
      expect(phases.every((phase) => phase >= 0 && phase < 1)).toBe(true);
      if (speed === 0) expect(new Set(phases)).toEqual(new Set([0.5]));
      else expect(phases[4]! - phases[0]!).toBeCloseTo(speed / 30, 9);
    }
    expect(() => testPatternPhase(Infinity, 0.1)).toThrow('finite, nonnegative');
    expect(() => testPatternPhase(0, NaN)).toThrow('cycles per second');
  });
});

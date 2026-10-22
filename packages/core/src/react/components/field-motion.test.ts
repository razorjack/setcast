import { describe, expect, test } from 'vite-plus/test';
import { FieldConfigSchema } from '../../visualizers.ts';
import { fieldPhases, fieldSize } from './field-motion.ts';

describe('field motion', () => {
  test('phase depends only on seed, absolute time and speed, including long sessions', () => {
    const expected = fieldPhases(8 * 3600, 0.3, 4294967295);
    fieldPhases(1, 2, 0);
    expect(fieldPhases(8 * 3600, 0.3, 4294967295)).toEqual(expected);
    expect(expected.every((phase) => phase >= 0 && phase < Math.PI * 2)).toBe(true);
    expect(fieldPhases(8 * 3600 + 1 / 60, 0.3, 4294967295)).not.toEqual(expected);
    expect(fieldPhases(8 * 3600, 0.3, 0)).not.toEqual(expected);
    expect(fieldPhases(0, 0, 42)).toEqual(fieldPhases(100, 0, 42));
  });

  test('resolution is bounded, aspect preserving and supports hidden boxes', () => {
    expect(fieldSize(1920, 1080, 0.5, 4096)).toEqual({ width: 960, height: 540 });
    expect(fieldSize(1080, 1920, 0.5, 4096)).toEqual({ width: 540, height: 960 });
    expect(fieldSize(15360, 8640, 1, 4096)).toEqual({ width: 4096, height: 2304 });
    expect(fieldSize(0, 0, 0.5, 4096)).toEqual({ width: 1, height: 1 });
  });

  test('invalid seed and resolution describe the allowed values', () => {
    const invalid = FieldConfigSchema.safeParse({ seed: -1, resolution: 2 });
    expect(invalid.success).toBe(false);
    if (invalid.success) return;
    expect(invalid.error.issues.map(({ path, message }) => ({ path, message }))).toEqual([
      { path: ['seed'], message: 'seed must be a whole number from 0 to 4294967295.' },
      { path: ['resolution'], message: 'resolution must be a number from 0.25 to 1.' },
    ]);
  });
});

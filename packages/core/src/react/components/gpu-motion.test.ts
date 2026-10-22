import { describe, expect, test } from 'vite-plus/test';
import {
  ConstellationConfigSchema,
  FieldConfigSchema,
  TunnelConfigSchema,
} from '../../visualizers.ts';
import {
  CONSTELLATION_CELL_PERIOD,
  CONSTELLATION_LAYERS,
  TUNNEL_RING_PERIOD,
  constellationMotion,
  fieldPhases,
  tunnelMotion,
} from './gpu-motion.ts';
import { drawingSize } from './shader-gl.ts';

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
    expect(drawingSize(1920, 1080, 0.5, 4096)).toEqual({ width: 960, height: 540 });
    expect(drawingSize(1080, 1920, 0.5, 4096)).toEqual({ width: 540, height: 960 });
    expect(drawingSize(15360, 8640, 1, 4096)).toEqual({ width: 4096, height: 2304 });
    expect(drawingSize(0, 0, 0.5, 4096)).toEqual({ width: 1, height: 1 });
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

describe('tunnel motion', () => {
  const config = { seed: 7, speed: 0.25, rings: 6, spin: -3 };

  test('travel and spin are bounded and keep sub-frame motion after eight hours', () => {
    const [travel, spin] = tunnelMotion(8 * 3600, config) as [number, number];
    expect(travel).toBeGreaterThanOrEqual(0);
    expect(travel).toBeLessThan(TUNNEL_RING_PERIOD);
    expect(spin).toBeGreaterThanOrEqual(0);
    expect(spin).toBeLessThan(Math.PI * 2);
    const [later] = tunnelMotion(8 * 3600 + 1 / 60, config) as [number];
    expect(later - travel).toBeCloseTo(0.25 * 6 * (1 / 60), 9);
  });

  test('travel wraps by whole ring periods, so ring identities continue seamlessly', () => {
    const lap = TUNNEL_RING_PERIOD / (config.speed * config.rings);
    expect(tunnelMotion(3 + lap, config)[0]).toBeCloseTo(tunnelMotion(3, config)[0]!, 9);
  });

  test('seed changes the arrangement; speed and spin 0 freeze it', () => {
    expect(tunnelMotion(10, config)).not.toEqual(tunnelMotion(10, { ...config, seed: 8 }));
    const still = { ...config, speed: 0, spin: 0 };
    expect(tunnelMotion(0, still)).toEqual(tunnelMotion(3600, still));
  });
});

describe('constellation motion', () => {
  const config = { seed: 3, speed: 0.3 };

  test('every value is bounded after eight hours and still moves within a frame', () => {
    const motion = constellationMotion(8 * 3600, config);
    expect(motion.phases.every((phase) => phase >= 0 && phase < Math.PI * 2)).toBe(true);
    expect(motion.depths.every((depth) => depth >= 0 && depth < 1)).toBe(true);
    expect(motion.drift.every((drift) => drift >= 0 && drift < CONSTELLATION_CELL_PERIOD)).toBe(
      true,
    );
    expect(motion.layers.every((layer) => Number.isInteger(layer) && layer >= 0)).toBe(true);
    expect(constellationMotion(8 * 3600 + 1 / 60, config)).not.toEqual(motion);
  });

  test('layers fly toward the viewer and return with a new identity', () => {
    const before = constellationMotion(100, config);
    const after = constellationMotion(100.5, config);
    expect(new Set(before.layers).size).toBe(CONSTELLATION_LAYERS);
    for (let layer = 0; layer < CONSTELLATION_LAYERS; layer++) {
      if (after.layers[layer] === before.layers[layer])
        expect(after.depths[layer]).toBeGreaterThan(before.depths[layer]!);
      else expect(after.depths[layer]).toBeLessThan(before.depths[layer]!);
    }
    const lap = 1 / (config.speed * 0.12);
    const returned = constellationMotion(100 + lap, config);
    expect(returned.depths[0]).toBeCloseTo(before.depths[0]!, 9);
    expect(returned.layers[0]).toBe(before.layers[0]! + CONSTELLATION_LAYERS);
  });

  test('seed changes the arrangement; speed 0 freezes it', () => {
    expect(constellationMotion(10, config)).not.toEqual(
      constellationMotion(10, { seed: 4, speed: 0.3 }),
    );
    expect(constellationMotion(0, { seed: 3, speed: 0 })).toEqual(
      constellationMotion(3600, { seed: 3, speed: 0 }),
    );
  });
});

describe('tunnel and constellation configuration', () => {
  test('defaults fill in and invalid values describe the allowed ones', () => {
    expect(TunnelConfigSchema.parse({})).toMatchObject({ sides: 6, rings: 6, spokes: 12 });
    expect(ConstellationConfigSchema.parse({})).toMatchObject({ density: 7, links: 1 });
    const tunnel = TunnelConfigSchema.safeParse({ sides: 2, rings: 1.5, depth: 3 });
    expect(tunnel.success).toBe(false);
    if (tunnel.success) return;
    expect(tunnel.error.issues.map(({ message }) => message)).toEqual([
      'sides must be 0 for round rings, or a whole number from 3 to 12.',
      'rings must be a whole number from 2 to 24.',
      'Unknown key "depth". tunnel takes: seed, speed, sides, rings, spokes, twist, spin, gain, resolution.',
    ]);
    const constellation = ConstellationConfigSchema.safeParse({ links: -1, resolution: 0.1 });
    expect(constellation.success).toBe(false);
    if (constellation.success) return;
    expect(constellation.error.issues.map(({ message }) => message)).toEqual([
      'links must be a number from 0 to 1.5.',
      'resolution must be a number from 0.25 to 1.',
    ]);
  });
});

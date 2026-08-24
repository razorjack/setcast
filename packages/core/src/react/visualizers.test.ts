import { z } from 'zod';
import { describe, expect, test } from 'vite-plus/test';
import { ConfigError } from '../errors.ts';
import { resolveVisualizerConfig } from '../visualizers.ts';
import { defineVisualizer, resolveVisualizer } from './visualizers.ts';

describe('resolveVisualizer', () => {
  test('applies the selected visualizer schema', () => {
    expect(resolveVisualizer({ name: 'spectrum' }).config).toMatchObject({ bars: 48 });
    expect(() => resolveVisualizer({ name: 'spectrum', bars: 'many' })).toThrow(ConfigError);
  });

  test('reports unknown visualizers as configuration errors', () => {
    expect(() => resolveVisualizer({ name: 'missing' })).toThrow(ConfigError);
  });

  test('registers into the same registry the config resolver reads', () => {
    defineVisualizer({
      name: 'plasma',
      schema: z.object({ name: z.literal('plasma'), rings: z.number().default(3) }),
      component: () => null,
    });
    expect(resolveVisualizerConfig({ name: 'plasma' })).toEqual({ name: 'plasma', rings: 3 });
    expect(resolveVisualizer({ name: 'plasma' }).config).toEqual({ name: 'plasma', rings: 3 });
  });
});

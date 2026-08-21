import { describe, expect, test } from 'vite-plus/test';
import { ConfigError } from '../errors.ts';
import { resolveVisualizer } from './visualizers.ts';

describe('resolveVisualizer', () => {
  test('applies the selected visualizer schema', () => {
    expect(resolveVisualizer({ name: 'spectrum' }).config).toMatchObject({ bars: 48 });
    expect(() => resolveVisualizer({ name: 'spectrum', bars: 'many' })).toThrow(ConfigError);
  });

  test('reports unknown visualizers as configuration errors', () => {
    expect(() => resolveVisualizer({ name: 'missing' })).toThrow(ConfigError);
  });
});

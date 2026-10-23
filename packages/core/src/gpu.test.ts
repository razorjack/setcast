import { expect, test } from 'vite-plus/test';
import { GpuCanvasConfigSchema } from './gpu.ts';
import { resolveVisualizerConfig } from './visualizers.ts';
import { ConfigError } from './errors.ts';

test('GPU recovery policy is bounded and shared by all shader visualizers', () => {
  expect(GpuCanvasConfigSchema.parse({})).toEqual({ resolution: 0.5, recoverySeconds: 5 });
  for (const name of ['field', 'tunnel', 'constellation']) {
    expect(resolveVisualizerConfig({ name }).recoverySeconds).toBe(5);
    expect(resolveVisualizerConfig({ name, recoverySeconds: 0 }).recoverySeconds).toBe(0);
    expect(resolveVisualizerConfig({ name, recoverySeconds: 15 }).recoverySeconds).toBe(15);
    for (const recoverySeconds of [-1, 16, NaN, Infinity, '5'])
      expect(() => resolveVisualizerConfig({ name, recoverySeconds })).toThrow(ConfigError);
  }
  const invalid = GpuCanvasConfigSchema.safeParse({ recoverySeconds: -1 });
  expect(invalid.success).toBe(false);
  if (!invalid.success) expect(invalid.error.issues[0]!.message).toContain('Use 0');
});

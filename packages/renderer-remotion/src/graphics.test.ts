import { expect, test } from 'vite-plus/test';
import { OutputSchema } from '@setcast/core';
import { graphicsOptions } from './graphics.ts';

test('auto selects ANGLE on macOS and leaves other platforms to Chromium', () => {
  const { gl } = OutputSchema.parse({});
  expect(graphicsOptions(gl, 'darwin')).toEqual({ gl: 'angle' });
  expect(graphicsOptions(gl, 'linux')).toEqual({ gl: null });
  expect(graphicsOptions(gl, 'win32')).toEqual({ gl: null });
});

test('an explicit backend overrides the platform choice', () => {
  expect(graphicsOptions('default', 'darwin')).toEqual({ gl: null });
  expect(graphicsOptions('swangle', 'darwin')).toEqual({ gl: 'swangle' });
  expect(graphicsOptions('angle', 'linux')).toEqual({ gl: 'angle' });
  expect(() => OutputSchema.parse({ gl: 'metal' })).toThrow('Use auto for the platform default');
});

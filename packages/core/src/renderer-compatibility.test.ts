import { expect, test } from 'vite-plus/test';
import { rendererCompatibility } from './renderer-compatibility.ts';
import { fixture } from './renderer-diagnostics.fixture.ts';

test('compatibility accumulates adapter limitations without probing the machine', () => {
  const issues = rendererCompatibility(fixture, {
    gl: 'egl',
    parallelEncoding: false,
    concurrency: 9,
    hardwareAcceleration: 'required',
  });
  expect(issues.map((issue) => issue.path)).toEqual([
    'gl',
    'parallelEncoding',
    'concurrency',
    'hardwareAcceleration',
  ]);
  expect(issues.every((issue) => issue.level === 'error' && issue.hint)).toBe(true);
  expect(rendererCompatibility(fixture, { resume: true, concurrency: 8 })).toEqual([]);
  expect(rendererCompatibility(fixture, {})).toEqual([]);
});

test('hardware fallback is a warning while unsupported resume is an error', () => {
  expect(rendererCompatibility(fixture, { hardwareAcceleration: 'if-possible' })).toMatchObject([
    { level: 'warning', path: 'hardwareAcceleration' },
  ]);
  const remotion = {
    ...fixture,
    features: fixture.features.filter((feature) => feature !== 'resume'),
  };
  expect(rendererCompatibility(remotion, { resume: true })).toMatchObject([
    { level: 'error', path: 'resume' },
  ]);
});

test('concurrency respects adapter bounds without pretending to know runtime limits', () => {
  for (const concurrency of [0, 1.5, Infinity, NaN])
    expect(rendererCompatibility(fixture, { concurrency })).toMatchObject([
      { path: 'concurrency' },
    ]);
  const automatic = { ...fixture, concurrency: { default: 'auto' as const, min: 1, max: null } };
  expect(rendererCompatibility(automatic, { concurrency: 100 })).toEqual([]);
  expect(rendererCompatibility(automatic, { concurrency: 0 })).toMatchObject([
    { path: 'concurrency' },
  ]);
});

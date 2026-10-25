import { expect, test } from 'vite-plus/test';
import {
  diagnosticOptions,
  rendererReadiness,
  type RendererCheck,
} from './renderer-diagnostics.ts';
import { fixture } from './renderer-diagnostics.fixture.ts';

test('readiness distinguishes absent evidence, prerequisites, optional failures and unsupported features', () => {
  expect(rendererReadiness(fixture, [])).toMatchObject({
    video: 'unchecked',
    hardwareEncoding: 'unsupported',
  });
  const checks: RendererCheck[] = [
    {
      id: 'browser',
      features: ['still', 'video', 'gpu', 'resume'],
      status: 'pass',
      message: 'started',
    },
    { id: 'capture', features: ['still', 'video', 'resume'], status: 'pass', message: 'captured' },
    { id: 'ffprobe', features: ['resume'], status: 'fail', message: 'missing' },
    { id: 'inspect', features: ['resume'], status: 'skipped', message: 'needs ffprobe' },
    { id: 'shader', features: ['gpu'], status: 'skipped', message: 'not attempted' },
  ];
  expect(rendererReadiness(fixture, checks)).toEqual({
    still: 'ready',
    video: 'ready',
    resume: 'unavailable',
    gpu: 'unchecked',
    webp: 'unchecked',
    hardwareEncoding: 'unsupported',
  });
  checks.push({
    id: 'browser-failure',
    features: ['still', 'video', 'gpu'],
    status: 'fail',
    message: 'closed',
  });
  expect(rendererReadiness(fixture, checks)).toMatchObject({
    still: 'unavailable',
    video: 'unavailable',
    gpu: 'unavailable',
  });
});

test('diagnostic requirements and timeouts reject malformed input before probing', () => {
  expect(diagnosticOptions().require).toEqual(['video']);
  expect(diagnosticOptions({ require: ['video', 'video', 'gpu'] }).require).toEqual([
    'video',
    'gpu',
  ]);
  for (const timeoutMs of [0, NaN, Infinity, 60_001, 1.5])
    expect(() => diagnosticOptions({ timeoutMs })).toThrow('timeout');
  expect(() => diagnosticOptions({ require: [] })).toThrow('requirements');
  expect(() => diagnosticOptions({ require: ['bogus' as 'video'] })).toThrow('requirements');
});

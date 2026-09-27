import { describe, expect, test } from 'vite-plus/test';
import { resolveVisualizerConfig } from './visualizers.ts';

const issuesOf = (config: unknown) => {
  try {
    resolveVisualizerConfig(config);
  } catch (error) {
    return (error as { issues: unknown }).issues;
  }
  throw new Error(`expected ${JSON.stringify(config)} to be rejected`);
};

describe('visualizer schemas', () => {
  test('an unknown key is answered with the keys the visualizer takes', () => {
    expect(issuesOf({ name: 'radial', colour: 'red' })).toEqual([
      {
        path: 'visualizer',
        message: expect.stringMatching(/^Unknown key "colour"\. radial takes: style, bars, /),
      },
    ]);
  });

  test('a setting out of range states its range', () => {
    expect(issuesOf({ name: 'spectrum', bars: 100 })).toEqual([
      { path: 'visualizer.bars', message: 'bars must be a whole number from 8 to 64.' },
    ]);
  });

  test('meters name the audio features they show', () => {
    expect(issuesOf({ name: 'meters', bands: ['bass', 'sub'] })).toEqual([
      {
        path: 'visualizer.bands[1]',
        message: 'bands must be a list of audio features: bass, mids, highs, rms, onset.',
      },
    ]);
  });

  test('spectrum segments need bars to cut', () => {
    expect(resolveVisualizerConfig({ name: 'spectrum', segments: 12 })).toMatchObject({
      style: 'bars',
      segments: 12,
    });
    expect(issuesOf({ name: 'spectrum', style: 'line', segments: 12 })).toEqual([
      { path: 'visualizer.segments', message: expect.stringContaining('set style: bars') },
    ]);
  });
});

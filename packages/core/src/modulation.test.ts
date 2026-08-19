import { describe, expect, test } from 'vite-plus/test';
import { SILENCE, type AudioAnalyzer } from './audio.ts';
import { evaluateModulation, ModRouteSchema, modulationVars } from './modulation.ts';

const constant = (bass: number): AudioAnalyzer => ({ featuresAt: () => ({ ...SILENCE, bass }) });
const route = (over: object) =>
  ModRouteSchema.parse({ source: 'bass', target: 'bg-zoom', ...over });

describe('evaluateModulation', () => {
  test('maps source through range and curve', () => {
    const ctx = { time: 1, fps: 30, section: null, analyzer: constant(0.5) };
    expect(evaluateModulation([route({ range: [1, 2] })], ctx)).toEqual({ 'bg-zoom': 1.5 });
    expect(evaluateModulation([route({ range: [1, 2], curve: 'pow2' })], ctx)).toEqual({
      'bg-zoom': 1.25,
    });
  });

  test('gated routes rest at range[0] outside their section', () => {
    const r = route({ range: [1, 2], when: 'drop' });
    const analyzer = constant(1);
    expect(evaluateModulation([r], { time: 1, fps: 30, section: null, analyzer })['bg-zoom']).toBe(
      1,
    );
    expect(
      evaluateModulation([r], { time: 1, fps: 30, section: 'drop', analyzer })['bg-zoom'],
    ).toBe(2);
  });

  test('later routes override earlier ones with the same target', () => {
    const ctx = { time: 1, fps: 30, section: null, analyzer: constant(1) };
    const out = evaluateModulation([route({ range: [0, 5] }), route({ range: [0, 9] })], ctx);
    expect(out).toEqual({ 'bg-zoom': 9 });
  });

  test('smoothing averages the trailing window', () => {
    const analyzer: AudioAnalyzer = { featuresAt: (t) => ({ ...SILENCE, bass: t >= 1 ? 1 : 0 }) };
    const sharp = evaluateModulation([route({})], { time: 1, fps: 30, section: null, analyzer });
    const smooth = evaluateModulation([route({ smooth: 0.5 })], {
      time: 1,
      fps: 30,
      section: null,
      analyzer,
    });
    expect(sharp['bg-zoom']).toBe(1);
    expect(smooth['bg-zoom']).toBeGreaterThan(0);
    expect(smooth['bg-zoom']).toBeLessThan(1);
  });

  test('schema rejects non-kebab targets and unknown sources', () => {
    expect(() => route({ target: 'bgZoom' })).toThrow(/kebab-case/);
    expect(() => route({ source: 'kick' })).toThrow();
  });
});

test('modulationVars prefixes and rounds', () => {
  expect(modulationVars({ 'bg-zoom': 1.23456789 })).toEqual({ '--mod-bg-zoom': '1.2346' });
});

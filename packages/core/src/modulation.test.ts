import { describe, expect, test } from 'vite-plus/test';
import { SILENCE, type AudioAnalyzer } from './audio.ts';
import type { SetEvent } from './events.ts';
import { evaluateModulation, ModRouteSchema, modulationVars } from './modulation.ts';
import { Timeline } from './timeline.ts';

const constant = (bass: number): AudioAnalyzer => ({ featuresAt: () => ({ ...SILENCE, bass }) });
const route = (over: object) =>
  ModRouteSchema.parse({ source: 'bass', target: 'bg-zoom', ...over });

const timeline = new Timeline([
  { type: 'drop', time: 10, intensity: 1 },
  { type: 'drop', time: 20, intensity: 1 },
  { type: 'double_drop', time: 50, intensity: 1 },
] satisfies SetEvent[]);
/** A `ModContext` at `time`, with no tempo unless the test overrides one. */
const at = (time: number, analyzer: AudioAnalyzer = constant(0)) => ({
  time,
  fps: 30,
  events: timeline.at(time),
  analyzer,
  bpm: null,
  beatOffset: 0,
});

describe('evaluateModulation', () => {
  test('beat and bar sources follow the tempo and rest at 0 without one', () => {
    const beat = route({ source: 'beat', range: [0, 1] });
    const bar = route({ source: 'bar', range: [0, 1] });
    const context = { ...at(0.75), bpm: 120, beatOffset: 0 };

    expect(evaluateModulation([beat], context)['bg-zoom']).toBeCloseTo(0.5);
    expect(evaluateModulation([bar], context)['bg-zoom']).toBeCloseTo(0.625);
    expect(evaluateModulation([beat], at(0.75))['bg-zoom']).toBe(0);
  });

  test('maps source through range and curve', () => {
    const context = at(1, constant(0.5));
    expect(evaluateModulation([route({ range: [1, 2] })], context)).toEqual({ 'bg-zoom': 1.5 });
    expect(evaluateModulation([route({ range: [1, 2], curve: 'pow2' })], context)).toEqual({
      'bg-zoom': 1.25,
    });
  });

  test('gated routes rest at range[0] outside their section', () => {
    const gated = route({ range: [1, 2], when: 'drop' });
    const analyzer = constant(1);

    expect(evaluateModulation([gated], at(5, analyzer))['bg-zoom']).toBe(1);
    expect(evaluateModulation([gated], at(11, analyzer))['bg-zoom']).toBe(2);
    expect(evaluateModulation([gated], at(51, analyzer))['bg-zoom']).toBe(2);
  });

  test('later routes override earlier ones with the same target, which are not evaluated', () => {
    let calls = 0;
    const counting: AudioAnalyzer = {
      featuresAt: () => {
        calls++;
        return { ...SILENCE, bass: 1 };
      },
    };
    const context = at(1, counting);
    const values = evaluateModulation(
      [route({ range: [0, 5] }), route({ range: [0, 9] })],
      context,
    );

    expect(values).toEqual({ 'bg-zoom': 9 });
    expect(calls).toBe(1);
  });

  test('smoothing averages the trailing window', () => {
    const analyzer: AudioAnalyzer = {
      featuresAt: (time) => ({ ...SILENCE, bass: time >= 1 ? 1 : 0 }),
    };
    const sharp = evaluateModulation([route({})], at(1, analyzer));
    const smooth = evaluateModulation([route({ smooth: 0.5 })], at(1, analyzer));
    expect(sharp['bg-zoom']).toBe(1);
    expect(smooth['bg-zoom']).toBeGreaterThan(0);
    expect(smooth['bg-zoom']).toBeLessThan(1);
  });

  test('schema rejects non-kebab targets and unknown sources', () => {
    expect(() => route({ target: 'bgZoom' })).toThrow(/kebab-case/);
    expect(() => route({ source: 'kick' })).toThrow();
    expect(() => route({ source: 'since:kick' })).toThrow();
  });
});

describe('timeline sources', () => {
  const decay = (over: object = {}) =>
    route({ source: 'since:drop', window: 4, range: [0, 1], ...over });

  test('since: is 1 at the event and 0 once the window has passed', () => {
    expect(evaluateModulation([decay()], at(10))['bg-zoom']).toBe(1);
    expect(evaluateModulation([decay()], at(11))['bg-zoom']).toBe(0.75);
    expect(evaluateModulation([decay()], at(14))['bg-zoom']).toBe(0);
    expect(evaluateModulation([decay()], at(30))['bg-zoom']).toBe(0);
  });

  test('until: climbs to the next event and releases when it lands', () => {
    const ramp = decay({ source: 'until:drop' });
    expect(evaluateModulation([ramp], at(14))['bg-zoom']).toBe(0);
    expect(evaluateModulation([ramp], at(17))['bg-zoom']).toBe(0.25);
    expect(evaluateModulation([ramp], at(19.9))['bg-zoom']).toBeCloseTo(0.975);
    expect(evaluateModulation([ramp], at(20))['bg-zoom']).toBe(0);
  });

  test('an event that never happens rests at range[0]', () => {
    const never = decay({ source: 'since:rewind', range: [0.2, 1] });
    expect(evaluateModulation([never], at(10))['bg-zoom']).toBe(0.2);
  });

  test('curve shapes the ramp', () => {
    const curved = decay({ curve: 'pow2' });
    expect(evaluateModulation([curved], at(12))['bg-zoom']).toBe(0.25);
  });
});

test('modulationVars prefixes and rounds', () => {
  expect(modulationVars({ 'bg-zoom': 1.23456789 })).toEqual({ '--mod-bg-zoom': '1.2346' });
});

import { describe, expect, test } from 'vite-plus/test';
import { normalizeMix } from './mix/mix.ts';
import { beatVars, stageData, stageVars, travelVars } from './stage.ts';
import { Timeline } from './mix/timeline.ts';

const timeline = new Timeline(
  normalizeMix(
    {
      plays: [{ id: 'a', at: 0, title: 'Alpha' }],
      annotations: [
        { kind: 'buildup', at: 20 },
        { kind: 'drop', at: 30, intensity: 0.8 },
        { kind: 'rewind', at: 50 },
        { kind: 'drop', at: 60 },
      ],
    },
    300,
  ),
);
const vars = (time: number, duration = 120) => stageVars(timeline.at(time), time, duration);

describe('stageVars', () => {
  test('reports seconds around the nearest drop', () => {
    expect(vars(35)).toMatchObject({
      '--since-drop': '5',
      '--until-drop': '25',
      '--drop-intensity': '0.8',
      '--section-time': '5',
    });
  });

  test('breakdowns and buildups are timed too', () => {
    expect(vars(25)).toMatchObject({
      '--since-buildup': '5',
      '--until-buildup': '60',
      '--since-breakdown': '60',
      '--until-rewind': '25',
    });
  });

  test('a later drop replaces intensity', () => {
    expect(vars(61)).toMatchObject({
      '--since-drop': '1',
      '--drop-intensity': '1',
    });
  });

  test('caps what has not happened', () => {
    expect(vars(10)).toMatchObject({
      '--since-drop': '60',
      '--since-rewind': '60',
      '--section-time': '60',
      '--drop-intensity': '0',
      '--until-drop': '20',
    });
  });

  test('set progress runs 0..1 over the whole set', () => {
    expect(vars(0)['--set-progress']).toBe('0');
    expect(vars(30)['--set-progress']).toBe('0.25');
    expect(vars(200)['--set-progress']).toBe('1');
    expect(vars(30, 0)['--set-progress']).toBe('0');
  });
});

describe('beatVars', () => {
  test('phases the beat and the bar from the offset', () => {
    expect(beatVars(1, 120, 0)).toEqual({ '--beat': '0', '--bar': '0.5' });
    expect(beatVars(1.25, 120, 0)['--beat']).toBe('0.5');
    expect(beatVars(0.1, 120, 0.1)).toEqual({ '--beat': '0', '--bar': '0' });
    expect(beatVars(0, 120, 0.25)['--beat']).toBe('0.5');
    expect(beatVars(5, null)).toEqual({});
  });
});

test('travelVars sets how far each band has travelled, and nothing without travel', () => {
  const travel = { step: 0.5, bass: [0, 0.5, 0.5], high: [0, 0.25, 1] };
  expect(travelVars(travel, 0.75)).toEqual({ '--travel-bass': '0.5', '--travel-high': '0.625' });
  expect(travelVars(null, 0.75)).toEqual({});
});

test('the stage carries mix section and explicit count, never a global deck', () => {
  expect(stageData(timeline.at(35), null)).toEqual({
    'data-section': 'drop',
    'data-current-plays': 1,
    'data-shared-drop': false,
    'data-background': 'none',
  });
});

test('the stage names the kind of background it shows', () => {
  const kind = (background: string | null) =>
    stageData(timeline.at(35), background)['data-background'];
  expect(kind('assets/loop.webm')).toBe('video');
  expect(kind('assets/bg.png')).toBe('image');
  expect(kind(null)).toBe('none');
});

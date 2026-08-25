import { describe, expect, test } from 'vite-plus/test';
import type { SetEvent } from './events.ts';
import { stageData, stageVars } from './stage.ts';
import { Timeline } from './timeline.ts';

const events: SetEvent[] = [
  { type: 'track_start', time: 0, title: 'Alpha', artist: 'A', deck: 'A' },
  { type: 'buildup', time: 20 },
  { type: 'drop', time: 30, intensity: 0.8 },
  { type: 'switch', time: 40, deck: 'B' },
  { type: 'rewind', time: 50 },
  { type: 'double_drop', time: 60, intensity: 1 },
];
const tl = new Timeline(events);
const vars = (time: number, duration = 120) => stageVars(tl.at(time), time, duration);

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

  test('a double drop is a drop', () => {
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

describe('stageData', () => {
  test('carries the section and the deck in front', () => {
    expect(stageData(tl.at(35))).toEqual({ 'data-section': 'drop', 'data-deck': 'A' });
    expect(stageData(tl.at(45))).toEqual({ 'data-section': 'drop', 'data-deck': 'B' });
    expect(stageData(tl.at(-1))).toEqual({ 'data-section': undefined, 'data-deck': undefined });
  });
});

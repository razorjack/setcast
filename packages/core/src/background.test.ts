import { describe, expect, test } from 'vite-plus/test';
import { backgroundVars, currentBackground, measureBackground } from './background.ts';
import { normalizeMix } from './mix.ts';
import { Timeline } from './timeline.ts';

const rgba = (...pixels: [number, number, number][]) =>
  pixels.flatMap(([red, green, blue]) => [red, green, blue, 255]);

describe('measureBackground', () => {
  test('averages Rec. 709 luma over the pixels', () => {
    expect(measureBackground(rgba([255, 255, 255], [0, 0, 0])).luma).toBeCloseTo(0.5);
    expect(measureBackground(rgba([0, 255, 0])).luma).toBeCloseTo(0.7152);
    expect(measureBackground([]).luma).toBe(0);
  });
});

describe('backgroundVars', () => {
  test('scales the art to the reference luma, within limits', () => {
    expect(backgroundVars({ luma: 0.09 })['--bg-exposure']).toBe('1.000');
    expect(backgroundVars({ luma: 0.45 })['--bg-exposure']).toBe('0.200');
    expect(backgroundVars({ luma: 1 })['--bg-exposure']).toBe('0.100');
    expect(backgroundVars({ luma: 0 })['--bg-exposure']).toBe('4.000');
  });

  test('says nothing when there is no measured art', () => {
    expect(backgroundVars(null)).toEqual({});
  });
});

test('the first focused play supplies the background, else the project', () => {
  const timeline = new Timeline(
    normalizeMix(
      {
        plays: [
          { id: 'a', at: 0, title: 'Alpha', background: 'assets/a.png' },
          { id: 'b', at: 60, title: 'Beta' },
        ],
      },
      120,
    ),
  );
  expect(currentBackground(timeline.at(10), 'assets/bg.png')).toBe('assets/a.png');
  expect(currentBackground(timeline.at(70), 'assets/bg.png')).toBe('assets/bg.png');
  expect(currentBackground(timeline.at(70), null)).toBe(null);
});

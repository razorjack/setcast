import { describe, expect, test } from 'vite-plus/test';
import {
  backgroundVars,
  backgroundWarnings,
  coverCrop,
  currentBackground,
  measureBackground,
  resolveFit,
} from './background.ts';
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

const frame = { width: 1920, height: 1080 };

describe('resolveFit', () => {
  test('auto covers art of nearly the frame shape and shows other shapes whole', () => {
    expect(coverCrop({ width: 1192, height: 670 }, frame)).toBeCloseTo(0, 2);
    expect(coverCrop({ width: 1000, height: 1000 }, frame)).toBeCloseTo(0.4375);
    expect(resolveFit('auto', { width: 1096, height: 729 }, frame)).toBe('cover');
    expect(resolveFit('auto', { width: 1000, height: 1000 }, frame)).toBe('contain');
    expect(resolveFit('cover', { width: 1000, height: 1000 }, frame)).toBe('cover');
  });
});

describe('backgroundWarnings', () => {
  test('warns that enlarged art will look soft and names the size that will not', () => {
    expect(
      backgroundWarnings('background bg.png', { width: 1192, height: 670 }, frame, 'auto'),
    ).toEqual([
      'background bg.png is 1192×670, so the 1920×1080 frame enlarges it 1.6× and it will look soft. Use a version at least 1080 px tall if you have one.',
    ]);
  });

  test('notes that auto shows art of another shape whole, unless the fit is explicit', () => {
    const square = { width: 1000, height: 1000 };
    expect(backgroundWarnings('background cover.png', square, frame, 'auto')).toEqual([
      'background cover.png is 1000×1000, another shape than the 1920×1080 frame, so it is shown whole over a blurred copy of itself. Set backgroundFit: cover to crop it to the frame instead, or backgroundFit: contain to keep this without the note.',
    ]);
    expect(backgroundWarnings('background cover.png', square, frame, 'contain')).toEqual([]);
  });
});

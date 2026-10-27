import { describe, expect, test } from 'vite-plus/test';
import {
  artBehind,
  backgroundVars,
  backgroundWarnings,
  coverCrop,
  currentBackground,
  measureBackground,
  resolveFit,
  type MeasuredArt,
} from './background.ts';
import { normalizeMix } from './mix/mix.ts';
import { Timeline } from './mix/timeline.ts';

/** One row of pixels. */
const measure = (...pixels: [number, number, number][]) =>
  measureBackground(
    pixels.flatMap(([red, green, blue]) => [red, green, blue, 255]),
    { width: pixels.length, height: 1 },
  );

describe('measureBackground', () => {
  test('averages Rec. 709 luma over the pixels and keeps each pixel as a grid cell', () => {
    expect(measure([255, 255, 255], [0, 0, 0]).luma).toBeCloseTo(0.5);
    expect(measure([0, 255, 0]).luma).toBeCloseTo(0.7152);
    expect(measure().luma).toBe(0);
    expect(measure([255, 255, 255], [0, 0, 0]).grid).toEqual({
      width: 2,
      height: 1,
      luma: [1, 0],
      detail: [1, 1],
    });
  });

  test('finds the heaviest hue and a second one at least 60° away', () => {
    const grey = new Array<[number, number, number]>(200).fill([90, 90, 90]);
    const red = new Array<[number, number, number]>(20).fill([200, 20, 20]);
    const orange = new Array<[number, number, number]>(10).fill([200, 90, 20]);
    const blue = new Array<[number, number, number]>(5).fill([20, 40, 200]);
    expect(measure(...grey, ...red, ...orange, ...blue).colors).toEqual([
      'rgb(200 43 20)',
      'rgb(20 40 200)',
    ]);
  });

  test('takes no colors from grey art or from a few stray pixels', () => {
    expect(measure(...new Array<[number, number, number]>(100).fill([80, 85, 90])).colors).toEqual(
      [],
    );
    const stray: [number, number, number][] = [
      ...new Array<[number, number, number]>(999).fill([60, 60, 60]),
      [255, 0, 0],
    ];
    expect(measure(...stray).colors).toEqual([]);
  });
});

describe('detail', () => {
  const grey: [number, number, number] = [128, 128, 128];
  const white: [number, number, number] = [255, 255, 255];
  const black: [number, number, number] = [0, 0, 0];
  /** Rows of pixels, top first. */
  const measureRows = (...rows: [number, number, number][][]) =>
    measureBackground(
      rows.flat().flatMap(([red, green, blue]) => [red, green, blue, 255]),
      { width: rows[0]!.length, height: rows.length },
    );
  /** A row of `width` pixels, alternating black and white where `busy`, grey elsewhere. */
  const row = (width: number, busy: (column: number) => boolean) =>
    Array.from({ length: width }, (_, column) => {
      if (!busy(column)) return grey;
      return column % 2 === 0 ? black : white;
    });
  const flatRow = (width: number) => row(width, () => false);
  const busyRow = (width: number) => row(width, () => true);

  test('flat art has no detail, its focus at the center and its calm area at the bottom left', () => {
    const flat = measureRows(flatRow(4), flatRow(4), flatRow(4));
    expect(flat.detail).toBe(0);
    expect(flat.focus).toEqual({ x: 0.5, y: 0.5 });
    expect(flat.calm).toEqual({ anchor: 'bottom-left', luma: expect.closeTo(0.502, 3), detail: 0 });
  });

  test('the focus sits on the busiest part of the art', () => {
    const corner = measureRows(
      [grey, grey, grey, white],
      [grey, grey, grey, grey],
      [grey, grey, grey, grey],
    );
    expect(corner.focus.x).toBeGreaterThan(0.75);
    expect(corner.focus.y).toBeLessThan(0.3);
  });

  test('the calm area is the candidate with the least detail', () => {
    const quietTopRight = (rowIndex: number) => row(10, (column) => !(rowIndex < 2 && column >= 6));
    const art = measureRows(...Array.from({ length: 6 }, (_, index) => quietTopRight(index)));
    expect(art.calm.anchor).toBe('top-right');
    expect(art.calm.detail).toBeLessThan(art.detail);
  });

  test('a portrait frame chooses between bands across the top and the bottom', () => {
    const busyBottom = Array.from({ length: 6 }, (_, index) =>
      index >= 3 ? busyRow(3) : flatRow(3),
    );
    expect(measureRows(...busyBottom).calm.anchor).toBe('top');
  });
});

describe('backgroundVars', () => {
  const art = (luma: number, colors: string[] = []): MeasuredArt => ({
    aspect: 1.5,
    stats: {
      luma,
      detail: 0.02,
      colors,
      focus: { x: 0.25, y: 0.75 },
      calm: { anchor: 'top-right', luma: 0.1, detail: 0.01 },
      grid: { width: 0, height: 0, luma: [], detail: [] },
    },
  });

  test('scales the art to the reference luma, within limits', () => {
    expect(backgroundVars(art(0.09))['--bg-exposure']).toBe('1.000');
    expect(backgroundVars(art(0.45))['--bg-exposure']).toBe('0.200');
    expect(backgroundVars(art(1))['--bg-exposure']).toBe('0.100');
    expect(backgroundVars(art(0))['--bg-exposure']).toBe('4.000');
    expect(backgroundVars(art(0.2, ['rgb(1 2 3)']))['--bg-color-1']).toBe('rgb(1 2 3)');
  });

  test('passes on the shape, the detail, the focus and the calm area', () => {
    expect(backgroundVars(art(0.2))).toMatchObject({
      '--bg-aspect': '1.5000',
      '--bg-detail': '0.020',
      '--bg-focus-x': '0.250',
      '--bg-focus-y': '0.750',
      '--bg-calm-luma': '0.100',
      '--bg-calm-detail': '0.010',
    });
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

describe('artBehind', () => {
  const grid = { width: 2, height: 2, luma: [0, 0.2, 0.6, 1], detail: [0.1, 0, 0, 0.3] };
  const lumaBehind = (area: Parameters<typeof artBehind>[1]) => artBehind(grid, area)?.luma;

  test('averages the cells under the area, weighted by how much of each it covers', () => {
    expect(lumaBehind({ left: 0, top: 0, right: 1, bottom: 1 })).toBeCloseTo(0.45);
    expect(lumaBehind({ left: 0, top: 0.5, right: 1, bottom: 1 })).toBeCloseTo(0.8);
    expect(lumaBehind({ left: 0.25, top: 0.5, right: 1, bottom: 1 })).toBeCloseTo(1.3 / 1.5);
    expect(artBehind(grid, { left: 0, top: 0, right: 1, bottom: 1 })?.detail).toBeCloseTo(0.1);
  });

  test('clips the area to the frame, and has nothing for an area outside it or without size', () => {
    expect(lumaBehind({ left: -1, top: 0.5, right: 0.5, bottom: 2 })).toBeCloseTo(0.6);
    expect(artBehind(grid, { left: 1.2, top: 0, right: 1.5, bottom: 1 })).toBeNull();
    expect(artBehind(grid, { left: 0.3, top: 0.3, right: 0.3, bottom: 0.6 })).toBeNull();
  });
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

import { describe, expect, test } from 'vite-plus/test';
import { lightLayers } from './lights.ts';

type Pixel = [number, number, number];

/** A square image of `side` pixels of `fill`, with `spots` painted over it. */
function image(side: number, fill: Pixel, spots: { at: [number, number]; color: Pixel }[] = []) {
  const rgba = new Uint8ClampedArray(side * side * 4);
  for (let pixel = 0; pixel < side * side; pixel++) rgba.set([...fill, 255], pixel * 4);
  for (const { at, color } of spots) rgba.set([...color, 255], (at[1] * side + at[0]) * 4);
  return { rgba, size: { width: side, height: side } };
}

const alphaAt = (layer: Uint8ClampedArray, side: number, [column, row]: [number, number]) =>
  layer[(row * side + column) * 4 + 3];

describe('lightLayers', () => {
  test('a lamp in a dark scene is a light in its own color; the scene is not', () => {
    const { rgba, size } = image(20, [20, 20, 25], [{ at: [5, 5], color: [255, 180, 60] }]);
    const [layer] = lightLayers(rgba, size, { share: 0.05, colors: [], layers: 1 });
    expect(Array.from(layer!.slice((5 * 20 + 5) * 4, (5 * 20 + 5) * 4 + 3))).toEqual([
      255, 180, 60,
    ]);
    expect(alphaAt(layer!, 20, [5, 5])).toBeGreaterThan(0);
    expect(alphaAt(layer!, 20, [12, 12])).toBe(0);
  });

  test('bright art without anything brighter than its surroundings has no lights', () => {
    const { rgba, size } = image(20, [230, 235, 240]);
    const [layer] = lightLayers(rgba, size, { share: 0.05, colors: [], layers: 1 });
    expect(layer!.some((channel, index) => index % 4 === 3 && channel > 0)).toBe(false);
  });

  test('two layers split the lights by the nearer of the two prominent hues', () => {
    const { rgba, size } = image(
      20,
      [10, 10, 10],
      [
        { at: [3, 3], color: [255, 120, 30] },
        { at: [15, 15], color: [40, 220, 255] },
        { at: [10, 3], color: [255, 255, 255] },
      ],
    );
    const colors = ['rgb(220 90 20)', 'rgb(20 180 230)'];
    const [warm, cold] = lightLayers(rgba, size, { share: 0.05, colors, layers: 2 });
    expect(alphaAt(warm!, 20, [3, 3])).toBeGreaterThan(0);
    expect(alphaAt(cold!, 20, [3, 3])).toBe(0);
    expect(alphaAt(cold!, 20, [15, 15])).toBeGreaterThan(0);
    expect(alphaAt(warm!, 20, [10, 3])).toBeGreaterThan(0);
  });
});

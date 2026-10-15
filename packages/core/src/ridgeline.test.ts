import { describe, expect, test } from 'vite-plus/test';
import { colorAt, heightAt, reliefField, spectrumBand, spectrumLift } from './ridgeline.ts';

/** A grey image `lumas.length` pixels wide and one tall, each pixel at its 0..255 level. */
function greyRow(lumas: number[]) {
  const rgba = new Uint8ClampedArray(lumas.length * 4);
  for (const [pixel, luma] of lumas.entries()) rgba.set([luma, luma, luma, 255], pixel * 4);
  return { rgba, size: { width: lumas.length, height: 1 } };
}

describe('reliefField', () => {
  test('dark art is stretched so its darkest and brightest parts span the relief', () => {
    const { rgba, size } = greyRow([10, 20, 30, 40, 50]);
    const field = reliefField(rgba, size);
    expect(field.heights[0]).toBe(0);
    expect(field.heights[4]).toBe(1);
    expect(heightAt(field, 0.5, 0.5)).toBeCloseTo(0.5, 1);
  });

  test('flat art keeps a flat relief', () => {
    const { rgba, size } = greyRow([40, 41, 40, 41, 40]);
    const field = reliefField(rgba, size);
    expect(Math.max(...field.heights)).toBeLessThan(0.1);
  });
});

describe('colorAt', () => {
  test('keeps the hue of the art at its height in the relief, and turns black grey', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 120, 10, 10, 255]);
    const field = reliefField(rgba, { width: 2, height: 1 });
    expect(colorAt(field, 0, 0.5)).toMatch(/^rgb\((\d+) \1 \1\)$/);
    const [red, green, blue] = colorAt(field, 1, 0.5).match(/\d+/g)!.map(Number);
    expect(red).toBeGreaterThan(200);
    expect(green).toBe(blue);
    expect(green).toBeLessThan(red! / 2);
  });
});

describe('spectrumLift', () => {
  const levels = [1, 0.5, 0];

  test('puts the bass at the center and the highs at both ends of the reach', () => {
    const band = { center: 0.5, reach: 0.4 };
    expect(spectrumLift(levels, 0.5, band)).toBe(1);
    expect(spectrumLift(levels, 0.35, band)).toBeCloseTo(spectrumLift(levels, 0.65, band));
    expect(spectrumLift([1, 1, 1], 0.89, band)).toBeLessThan(0.1);
    expect(spectrumLift([1, 1, 1], 0.95, band)).toBe(0);
  });

  test('keeps the band inside the line when the subject is near an edge', () => {
    expect(spectrumBand(0.1, 0.6)).toEqual({ center: 0.3, reach: 0.3 });
    expect(spectrumBand(0.6, 0.6)).toEqual({ center: 0.6, reach: 0.3 });
  });
});

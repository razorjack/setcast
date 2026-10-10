import { hue, MIN_CHROMA, type Size } from './background.ts';

/** How the lights of the art are picked out and split. */
export interface LightOptions {
  /** Share of the pixels that may count as light, the brightest first. */
  share: number;
  /** The art's prominent hues as `rgb()` colors; a light joins the layer of the nearest one. */
  colors: string[];
  /** How many layers to split the lights into. */
  layers: number;
}

/** A light is clearly brighter than its surroundings, so a bright sky or paper does not glow. */
const MIN_CONTRAST = 0.12;
/** The brightest part of a dim image is not a light. */
const MIN_LUMA = 0.3;
/** The surroundings of a pixel: a square this share of the image's long side across. */
const SURROUNDINGS = 0.06;
/** How opaque the faintest light is; brighter ones are more so. */
const MIN_ALPHA = 0.35;

/**
 * Picks out the art's lights, the lamps, signs, eyes and suns: pixels among the brightest `share`
 * that are also clearly brighter than their surroundings. Returns one RGBA image per layer, each
 * light in its own color and more opaque the brighter it is, transparent elsewhere. With two
 * layers, a light goes to the layer of the prominent hue nearest its own; a grey light, or any
 * light in art without two prominent hues, goes to the first.
 */
export function lightLayers(
  rgba: ArrayLike<number>,
  size: Size,
  options: LightOptions,
): Uint8ClampedArray<ArrayBuffer>[] {
  const luma = lumaOf(rgba, size);
  const threshold = Math.max(MIN_LUMA, quantile(luma, 1 - options.share));
  const surroundings = boxMeans(luma, size, surroundingRadius(size));
  const splits = options.layers > 1 && options.colors.length >= options.layers;
  const hues = splits ? options.colors.map(colorHue) : [];
  const layers = Array.from(
    { length: options.layers },
    () => new Uint8ClampedArray(luma.length * 4),
  );
  for (let pixel = 0; pixel < luma.length; pixel++) {
    const brightness = luma[pixel]!;
    if (brightness < threshold || brightness - surroundings[pixel]! < MIN_CONTRAST) continue;
    const offset = pixel * 4;
    const layer = layers[nearestHue(rgba, offset, hues)]!;
    layer[offset] = rgba[offset]!;
    layer[offset + 1] = rgba[offset + 1]!;
    layer[offset + 2] = rgba[offset + 2]!;
    layer[offset + 3] = 255 * alpha(brightness, threshold);
  }
  return layers;
}

function lumaOf(rgba: ArrayLike<number>, size: Size): Float32Array {
  const luma = new Float32Array(size.width * size.height);
  for (let pixel = 0; pixel < luma.length; pixel++) {
    const offset = pixel * 4;
    luma[pixel] =
      (0.2126 * rgba[offset]! + 0.7152 * rgba[offset + 1]! + 0.0722 * rgba[offset + 2]!) / 255;
  }
  return luma;
}

/** The value below which `fraction` of the values lie. */
function quantile(values: Float32Array, fraction: number): number {
  if (values.length === 0) return 1;
  const sorted = values.toSorted();
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * sorted.length)));
  return sorted[index]!;
}

const surroundingRadius = ({ width, height }: Size) =>
  Math.max(1, Math.round((Math.max(width, height) * SURROUNDINGS) / 2));

/** The mean of the square of `radius` around each pixel, clipped to the image, from running sums. */
function boxMeans(values: Float32Array, { width, height }: Size, radius: number): Float32Array {
  const stride = width + 1;
  const sums = new Float64Array(stride * (height + 1));
  for (let row = 0; row < height; row++) {
    let rowSum = 0;
    for (let column = 0; column < width; column++) {
      rowSum += values[row * width + column]!;
      sums[(row + 1) * stride + column + 1] = sums[row * stride + column + 1]! + rowSum;
    }
  }
  const means = new Float32Array(values.length);
  for (let row = 0; row < height; row++) {
    const top = Math.max(0, row - radius);
    const bottom = Math.min(height, row + radius + 1);
    for (let column = 0; column < width; column++) {
      const left = Math.max(0, column - radius);
      const right = Math.min(width, column + radius + 1);
      const sum =
        sums[bottom * stride + right]! -
        sums[top * stride + right]! -
        sums[bottom * stride + left]! +
        sums[top * stride + left]!;
      means[row * width + column] = sum / ((bottom - top) * (right - left));
    }
  }
  return means;
}

function colorHue(color: string): number {
  const channels = /^rgb\((\d+) (\d+) (\d+)\)$/.exec(color);
  if (!channels) {
    throw new TypeError(
      `lightLayers() expects colors as rgb(r g b), as measureBackground() writes them; received "${color}".`,
    );
  }
  const [red, green, blue] = channels.slice(1).map((channel) => Number(channel) / 255);
  return hue(red!, green!, blue!);
}

/** The index of the hue nearest the pixel's, or 0 for a grey pixel or when there are no hues. */
function nearestHue(rgba: ArrayLike<number>, offset: number, hues: number[]): number {
  const red = rgba[offset]! / 255;
  const green = rgba[offset + 1]! / 255;
  const blue = rgba[offset + 2]! / 255;
  if (hues.length < 2 || Math.max(red, green, blue) - Math.min(red, green, blue) < MIN_CHROMA) {
    return 0;
  }
  const own = hue(red, green, blue);
  const distances = hues.map((other) =>
    Math.min(Math.abs(own - other), 360 - Math.abs(own - other)),
  );
  return distances.indexOf(Math.min(...distances));
}

const alpha = (brightness: number, threshold: number) =>
  MIN_ALPHA +
  (1 - MIN_ALPHA) * Math.min(1, (brightness - threshold) / Math.max(0.01, 1 - threshold));

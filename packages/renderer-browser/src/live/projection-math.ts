import type { Projection } from '@setcast/core';

/** Map composition pixels to a quadrilateral, in CSS matrix3d column-major order. */
export function projectionMatrix(corners: Projection['corners'], width: number, height: number) {
  if (!(Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0))
    throw new RangeError(
      `projectionMatrix needs positive finite dimensions; received ${width}×${height}.`,
    );
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = corners;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy3 = y0 - y1 + y2 - y3;
  const determinant = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(determinant) < 0.000001)
    throw new RangeError(
      'projectionMatrix received degenerate corners. Validate them with ProjectionSchema.',
    );
  const g = (dx3 * dy2 - dx2 * dy3) / determinant;
  const h = (dx1 * dy3 - dx3 * dy1) / determinant;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  return [
    a,
    (d * height) / width,
    0,
    g / width,
    (b * width) / height,
    e,
    0,
    h / height,
    0,
    0,
    1,
    0,
    x0 * width,
    y0 * height,
    0,
    1,
  ];
}

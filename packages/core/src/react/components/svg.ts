export interface Point {
  x: number;
  y: number;
}

const coordinate = (value: number) => value.toFixed(1);
const at = ({ x, y }: Point) => `${coordinate(x)} ${coordinate(y)}`;

/**
 * An SVG path through every point, curved as a uniform Catmull-Rom spline written as cubic
 * Béziers. `closed` joins the last point back to the first with the same curvature.
 */
export function smoothPath(points: readonly Point[], closed = false): string {
  const count = points.length;
  if (count < 2) return '';
  const point = (index: number): Point => {
    if (closed) return points[(index + count) % count]!;
    return points[Math.min(count - 1, Math.max(0, index))]!;
  };

  const segments = [`M ${at(points[0]!)}`];
  const segmentCount = closed ? count : count - 1;
  for (let index = 0; index < segmentCount; index++) {
    const before = point(index - 1);
    const from = point(index);
    const to = point(index + 1);
    const after = point(index + 2);
    const leave = { x: from.x + (to.x - before.x) / 6, y: from.y + (to.y - before.y) / 6 };
    const arrive = { x: to.x - (after.x - from.x) / 6, y: to.y - (after.y - from.y) / 6 };
    segments.push(`C ${at(leave)} ${at(arrive)} ${at(to)}`);
  }
  if (closed) segments.push('Z');
  return segments.join(' ');
}

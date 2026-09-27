import { VectorscopeConfigSchema, type VectorscopeConfig } from '../../visualizers.ts';
import { useFrame } from '../frame.tsx';
import { linePath, type Point } from './svg.ts';

export { VectorscopeConfigSchema, type VectorscopeConfig };

const BOX = 1000;
const CENTRE = BOX / 2;

/**
 * Left against right, turned 45 degrees: mono stands on the vertical axis, a wide mix spreads
 * sideways, and a hard-left sound leans up and to the left. SVG so themes style it:
 * `.sc-vectorscope-line` for the trace, `.sc-vectorscope-grid` for the circle and axes.
 */
export function Vectorscope({ config }: { config: VectorscopeConfig }) {
  const { left, right } = useFrame().audio.wave;
  const points = left.map((sample, index) => plot(sample, right[index]!, config.gain));

  return (
    <svg className="sc-vectorscope" viewBox={`0 0 ${BOX} ${BOX}`}>
      <circle className="sc-vectorscope-grid" cx={CENTRE} cy={CENTRE} r={CENTRE} />
      <line className="sc-vectorscope-grid" x1={CENTRE} y1={0} x2={CENTRE} y2={BOX} />
      <line className="sc-vectorscope-grid" x1={0} y1={CENTRE} x2={BOX} y2={CENTRE} />
      <path className="sc-vectorscope-line" d={linePath(points)} />
    </svg>
  );
}

/** One stereo sample as a point, pulled in to the circle when it would land outside it. */
function plot(left: number, right: number, gain: number): Point {
  const side = ((right - left) / Math.SQRT2) * gain;
  const mid = ((left + right) / Math.SQRT2) * gain;
  const reach = Math.max(1, Math.hypot(side, mid));
  return { x: CENTRE + (side / reach) * CENTRE, y: CENTRE - (mid / reach) * CENTRE };
}

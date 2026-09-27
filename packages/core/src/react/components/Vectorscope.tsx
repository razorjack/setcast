import type { Wave } from '../../audio.ts';
import { VectorscopeConfigSchema, type VectorscopeConfig } from '../../visualizers.ts';
import { useFrame } from '../frame.tsx';
import { useTrail } from './history.ts';
import { linePath, type Point } from './svg.ts';

export { VectorscopeConfigSchema, type VectorscopeConfig };

const BOX = 1000;
const CENTRE = BOX / 2;

/**
 * Left against right, turned 45 degrees: mono stands on the vertical axis, a wide mix spreads
 * sideways, and a hard-left sound leans up and to the left. SVG so themes style it:
 * `.sc-vectorscope-line` for the trace, `.sc-vectorscope-grid` for the circle and axes, and
 * `.sc-vectorscope-trail` for earlier traces, each with its `--age` (0..1, older is higher).
 */
export function Vectorscope({ config }: { config: VectorscopeConfig }) {
  const { wave } = useFrame().audio;
  const trail = useTrail(config.trail);

  return (
    <svg className="sc-vectorscope" viewBox={`0 0 ${BOX} ${BOX}`}>
      <circle className="sc-vectorscope-grid" cx={CENTRE} cy={CENTRE} r={CENTRE} />
      <line className="sc-vectorscope-grid" x1={CENTRE} y1={0} x2={CENTRE} y2={BOX} />
      <line className="sc-vectorscope-grid" x1={0} y1={CENTRE} x2={BOX} y2={CENTRE} />
      {trail.map(({ wave, age }, index) => (
        <path
          key={index}
          className="sc-vectorscope-trail"
          style={{ '--age': age }}
          d={trace(wave, config.gain)}
        />
      ))}
      <path className="sc-vectorscope-line" d={trace(wave, config.gain)} />
    </svg>
  );
}

function trace({ left, right }: Wave, gain: number): string {
  return linePath(left.map((sample, index) => plot(sample, right[index]!, gain)));
}

/** One stereo sample as a point, pulled in to the circle when it would land outside it. */
function plot(left: number, right: number, gain: number): Point {
  const side = ((right - left) / Math.SQRT2) * gain;
  const mid = ((left + right) / Math.SQRT2) * gain;
  const reach = Math.max(1, Math.hypot(side, mid));
  return { x: CENTRE + (side / reach) * CENTRE, y: CENTRE - (mid / reach) * CENTRE };
}

import type { Wave } from '../../audio.ts';
import { clamp } from '../../motion.ts';
import { OscilloscopeConfigSchema, type OscilloscopeConfig } from '../../visualizers.ts';
import { useFrame } from '../frame.tsx';
import { useTrail } from './history.ts';
import { linePath } from './svg.ts';

export { OscilloscopeConfigSchema, type OscilloscopeConfig };

const WIDTH = 1000;
const HEIGHT = 200;
const MIDDLE = HEIGHT / 2;

/**
 * The waveform of the last frame, both channels mixed, as one trace across the stage. SVG so themes
 * style it: `.sc-oscilloscope-line` for the trace, `.sc-oscilloscope-axis` for the zero line, and
 * `.sc-oscilloscope-trail` for earlier traces, each with its `--age` (0..1, older is higher).
 */
export function Oscilloscope({ config }: { config: OscilloscopeConfig }) {
  const { wave } = useFrame().audio;
  const trail = useTrail(config.trail);

  return (
    <svg className="sc-oscilloscope" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
      <line className="sc-oscilloscope-axis" x1={0} y1={MIDDLE} x2={WIDTH} y2={MIDDLE} />
      {trail.map(({ wave, age }, index) => (
        <path
          key={index}
          className="sc-oscilloscope-trail"
          style={{ '--age': age }}
          d={trace(wave, config.gain)}
        />
      ))}
      <path className="sc-oscilloscope-line" d={trace(wave, config.gain)} />
    </svg>
  );
}

/** Both channels mixed into one line across the box. */
function trace({ left, right }: Wave, gain: number): string {
  const lastIndex = left.length - 1;
  const points = left.map((sample, index) => {
    const mixed = ((sample + right[index]!) / 2) * gain;
    return { x: (index / lastIndex) * WIDTH, y: MIDDLE - clamp(mixed, -1, 1) * MIDDLE };
  });
  return linePath(points);
}

import { level, sampleBins } from '../../audio.ts';
import { RadialConfigSchema, type RadialConfig } from '../../visualizers.ts';
import { useFrame } from '../frame.tsx';

export { RadialConfigSchema, type RadialConfig };

const BOX = 1000;
const CENTRE = BOX / 2;

/** Bars radiating from a ring. SVG so themes style it (`.sc-radial line`, `.sc-radial circle`). */
export function Radial({ config }: { config: RadialConfig }) {
  const { audio, timeSeconds } = useFrame();
  const { bars, radius, length, gain, floor, spin } = config;
  const ringRadius = radius * BOX;
  const maxLength = length * BOX;
  const step = Math.PI / bars;
  const values = sampleBins(audio.bins, bars);

  const lines = [];
  for (let bar = 0; bar < bars; bar++) {
    const barLength = level(values[bar]!, gain, floor) * maxLength;
    // Mirrored around the vertical axis: bass at the bottom, highs climbing both sides.
    for (const side of [1, -1]) {
      const angle = Math.PI / 2 + side * (bar + 0.5) * step;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      lines.push(
        <line
          key={`${side}${bar}`}
          x1={CENTRE + cos * ringRadius}
          y1={CENTRE + sin * ringRadius}
          x2={CENTRE + cos * (ringRadius + barLength)}
          y2={CENTRE + sin * (ringRadius + barLength)}
        />,
      );
    }
  }

  return (
    <svg className="sc-radial" viewBox={`0 0 ${BOX} ${BOX}`}>
      <g transform={`rotate(${(timeSeconds * spin) % 360} ${CENTRE} ${CENTRE})`}>
        <circle cx={CENTRE} cy={CENTRE} r={ringRadius} />
        {lines}
      </g>
    </svg>
  );
}

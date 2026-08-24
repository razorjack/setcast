import { sampleBins } from '../../audio.ts';
import { RadialConfigSchema, type RadialConfig } from '../../visualizers.ts';
import { useFrame } from '../frame.tsx';

export { RadialConfigSchema, type RadialConfig };

const S = 1000;

/** Bars radiating from a ring. SVG so themes style it (`.sc-radial line`, `.sc-radial circle`). */
export function Radial({ config }: { config: RadialConfig }) {
  const { audio, timeSeconds } = useFrame();
  const { bars, radius, length, gain, floor, spin } = config;
  const r = radius * S;
  const max = length * S;
  const step = Math.PI / bars;
  const values = sampleBins(audio.bins, bars);
  const lines = [];
  for (let i = 0; i < bars; i++) {
    const v = Math.max(floor, Math.min(1, values[i]! * gain));
    const len = v * max;
    for (const side of [1, -1]) {
      const a = Math.PI / 2 + side * (i + 0.5) * step;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      lines.push(
        <line
          key={`${side}${i}`}
          x1={S / 2 + cos * r}
          y1={S / 2 + sin * r}
          x2={S / 2 + cos * (r + len)}
          y2={S / 2 + sin * (r + len)}
        />,
      );
    }
  }
  return (
    <svg className="sc-radial" viewBox={`0 0 ${S} ${S}`}>
      <g transform={`rotate(${(timeSeconds * spin) % 360} ${S / 2} ${S / 2})`}>
        <circle cx={S / 2} cy={S / 2} r={r} />
        {lines}
      </g>
    </svg>
  );
}

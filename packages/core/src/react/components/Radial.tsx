import { level, sampleBins } from '../../audio.ts';
import { RadialConfigSchema, type RadialConfig } from '../../visualizers.ts';
import { useFrame } from '../frame.tsx';
import { smoothPath, type Point } from './svg.ts';

export { RadialConfigSchema, type RadialConfig };

const BOX = 1000;
const CENTRE = BOX / 2;

interface Spoke {
  angle: number;
  /** Distance from the centre to the tip. */
  reach: number;
}

/**
 * Bars radiating from a ring. SVG so themes style it: `.sc-radial line` and `.sc-radial circle`,
 * plus `.sc-radial-line` and `.sc-radial-area` for `style: line`.
 */
export function Radial({ config }: { config: RadialConfig }) {
  const { audio, timeSeconds } = useFrame();
  const { style, bars, radius, length, gain, floor, spin } = config;
  const ringRadius = radius * BOX;
  const levels = sampleBins(audio.bins, bars).map((bin) => level(bin, gain, floor));
  const spokes = spokesAround(levels, ringRadius, length * BOX);

  return (
    <svg className="sc-radial" data-style={style} viewBox={`0 0 ${BOX} ${BOX}`}>
      <g transform={`rotate(${(timeSeconds * spin) % 360} ${CENTRE} ${CENTRE})`}>
        <circle cx={CENTRE} cy={CENTRE} r={ringRadius} />
        {style === 'line' ? (
          <RadialLine spokes={spokes} ringRadius={ringRadius} />
        ) : (
          <RadialBars spokes={spokes} ringRadius={ringRadius} />
        )}
      </g>
    </svg>
  );
}

/**
 * One spoke per bar and side, in order around the ring. Mirrored around the vertical axis: bass at
 * the bottom, highs climbing both sides to meet at the top.
 */
function spokesAround(levels: number[], ringRadius: number, maxLength: number): Spoke[] {
  const step = Math.PI / levels.length;
  const spoke = (level: number, bar: number, side: 1 | -1): Spoke => ({
    angle: Math.PI / 2 + side * (bar + 0.5) * step,
    reach: ringRadius + level * maxLength,
  });
  const oneSide = levels.map((level, bar) => spoke(level, bar, 1));
  const otherSide = levels.map((level, bar) => spoke(level, bar, -1)).reverse();
  return [...oneSide, ...otherSide];
}

const polar = (angle: number, distance: number): Point => ({
  x: CENTRE + Math.cos(angle) * distance,
  y: CENTRE + Math.sin(angle) * distance,
});

function RadialBars({ spokes, ringRadius }: { spokes: Spoke[]; ringRadius: number }) {
  return spokes.map(({ angle, reach }, index) => {
    const base = polar(angle, ringRadius);
    const tip = polar(angle, reach);
    return <line key={index} x1={base.x} y1={base.y} x2={tip.x} y2={tip.y} />;
  });
}

/** A closed line through the tips, and the band between it and the ring. */
function RadialLine({ spokes, ringRadius }: { spokes: Spoke[]; ringRadius: number }) {
  const outline = smoothPath(
    spokes.map(({ angle, reach }) => polar(angle, reach)),
    true,
  );
  const ring = circlePath(ringRadius);
  return (
    <>
      <path className="sc-radial-area" d={`${outline} ${ring}`} fillRule="evenodd" />
      <path className="sc-radial-line" d={outline} />
    </>
  );
}

const circlePath = (radius: number): string =>
  `M ${CENTRE - radius} ${CENTRE} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0 Z`;

import { useRef } from 'react';
import { scaleLevel, sampleBins } from '../../audio.ts';
import { RadialConfigSchema, type RadialConfig } from '../../visualizers.ts';
import { useFrame } from '../frame.tsx';
import { ArtReveal, type Outline } from './ArtReveal.tsx';
import { polygonPath, smoothPath, type Point } from './svg.ts';

export { RadialConfigSchema, type RadialConfig };

const BOX = 1000;
const CENTRE = BOX / 2;
/** Share of its slot around the ring that a bar shows the art through with `fill: art`. */
const WEDGE = 0.6;
/** Corners of the ring as `fill: art` cuts it out of the band, enough to look round. */
const RING_POINTS = 120;

interface Spoke {
  angle: number;
  /** Distance from the centre to the tip. */
  reach: number;
}

/**
 * Bars radiating from a ring. SVG so themes style it: `.sc-radial line` and `.sc-radial circle`,
 * plus `.sc-radial-line` and `.sc-radial-area` for `style: line`. With `fill: art`,
 * `.sc-radial-art` shows the background art through a wedge per bar, or through the band.
 */
export function Radial({ config }: { config: RadialConfig }) {
  const { audio, timeSeconds } = useFrame();
  const { style, bars, radius, length, gain, floor, spin } = config;
  const svgRef = useRef<SVGSVGElement>(null);
  const ringRadius = radius * BOX;
  const rotation = (timeSeconds * spin) % 360;
  const levels = sampleBins(audio.bins, bars).map((bin) => scaleLevel(bin, gain, floor));
  const spokes = spokesAround(levels, ringRadius, length * BOX);

  return (
    <>
      <svg
        ref={svgRef}
        className="sc-radial"
        data-style={style}
        data-fill={config.fill}
        viewBox={`0 0 ${BOX} ${BOX}`}
      >
        <g transform={`rotate(${rotation} ${CENTRE} ${CENTRE})`}>
          <circle cx={CENTRE} cy={CENTRE} r={ringRadius} />
          {style === 'line' ? (
            <RadialLine spokes={spokes} ringRadius={ringRadius} />
          ) : (
            <RadialBars spokes={spokes} ringRadius={ringRadius} />
          )}
        </g>
      </svg>
      {config.fill === 'art' && (
        <ArtReveal
          className="sc-radial-art"
          target={svgRef}
          outline={revealOutline(style, rotated(spokes, rotation), ringRadius)}
          fillRule={style === 'line' ? 'evenodd' : 'nonzero'}
        />
      )}
    </>
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

const rotated = (spokes: Spoke[], degrees: number): Spoke[] =>
  spokes.map((spoke) => ({ ...spoke, angle: spoke.angle + (degrees * Math.PI) / 180 }));

/** The shapes `fill: art` shows the art through: a wedge per bar, or the band and its hole. */
function revealOutline(style: 'bars' | 'line', spokes: Spoke[], ringRadius: number): Outline {
  if (style === 'line') {
    const ring = Array.from({ length: RING_POINTS }, (_, index) =>
      polar((index / RING_POINTS) * 2 * Math.PI, ringRadius),
    );
    const outline = spokes.map(({ angle, reach }) => polar(angle, reach));
    return (toStage) =>
      `${smoothPath(outline.map(toStage), true)} ${polygonPath(ring.map(toStage))}`;
  }
  const halfWidth = (Math.PI / spokes.length) * WEDGE;
  const wedges = spokes.map(({ angle, reach }) => [
    polar(angle - halfWidth, ringRadius),
    polar(angle - halfWidth, reach),
    polar(angle + halfWidth, reach),
    polar(angle + halfWidth, ringRadius),
  ]);
  return (toStage) => wedges.map((wedge) => polygonPath(wedge.map(toStage))).join(' ');
}

import { useId, useRef } from 'react';
import { scaleLevel, sampleBins, segmentedLevel, type AudioFeatures } from '../../audio.ts';
import { SpectrumConfigSchema, type SpectrumConfig } from '../../visualizers.ts';
import { useFrame } from '../frame.tsx';
import { ArtReveal, type Outline } from './ArtReveal.tsx';
import { usePeaks } from './history.ts';
import { areaPath, polygonPath, smoothPath, type Point } from './svg.ts';

export { SpectrumConfigSchema, type SpectrumConfig };

const WIDTH = 1000;
const HEIGHT = 100;
const CENTRE = WIDTH / 2;
/** Share of each cell left dark when bars are split into segments. */
const CELL_GAP = 0.3;
/** Height of a peak marker on solid bars, as a share of the full height. */
const PEAK_MARK = 0.02;
const BASE: Point[] = [
  { x: WIDTH, y: HEIGHT },
  { x: 0, y: HEIGHT },
];

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Mirrored bars, bass at the center. SVG so themes style it with CSS: `.sc-spectrum-bars rect`
 * for bars, `.sc-spectrum-peaks rect` for their peak markers, `.sc-spectrum-line` and
 * `.sc-spectrum-area` for `style: line`. With `fill: art`, `.sc-spectrum-art` shows the background
 * art through the bars or the area.
 */
export function Spectrum({ config }: { config: SpectrumConfig }) {
  const { audio } = useFrame();
  const { style, bars, gain, floor, gap, segments } = config;
  const svgRef = useRef<SVGSVGElement>(null);
  const levelsOf = (features: AudioFeatures) =>
    sampleBins(features.bins, bars).map((bin) => scaleLevel(bin, gain, floor));
  const levels = levelsOf(audio);
  const peaks = usePeaks(config.peak, levels, levelsOf);
  const barShapes = style === 'bars' ? barRects(levels, gap, segments) : [];
  const line = style === 'line' ? linePoints(levels) : [];

  return (
    <>
      <svg
        ref={svgRef}
        className="sc-spectrum"
        data-style={style}
        data-fill={config.fill}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
      >
        {style === 'line' ? (
          <SpectrumLine line={line} />
        ) : (
          <SpectrumBars
            bars={barShapes}
            peaks={peakRects(peaks, gap, segments)}
            segments={segments}
          />
        )}
      </svg>
      {config.fill === 'art' && (
        <ArtReveal
          className="sc-spectrum-art"
          target={svgRef}
          outline={style === 'line' ? areaOutline(line) : barsOutline(barShapes, segments)}
        />
      )}
    </>
  );
}

interface SpectrumBarsProps {
  bars: Rect[];
  /** One per bar, or empty when the spectrum holds no peaks. */
  peaks: Rect[];
  segments: number;
}

function SpectrumBars({ bars, peaks, segments }: SpectrumBarsProps) {
  const maskId = useId();
  const mask = segments > 0 ? `url(#${maskId})` : undefined;
  return (
    <>
      {segments > 0 && <CellMask id={maskId} segments={segments} />}
      <g className="sc-spectrum-bars" mask={mask}>
        {bars.map(rectElement)}
      </g>
      {peaks.length > 0 && (
        <g className="sc-spectrum-peaks" mask={mask}>
          {peaks.map(rectElement)}
        </g>
      )}
    </>
  );
}

const rectElement = (rect: Rect, index: number) => <rect key={index} {...rect} />;

interface BarLayout {
  slot: number;
  width: number;
  inset: number;
}

const barLayout = (count: number, gap: number): BarLayout => {
  const slot = CENTRE / count;
  const width = slot * (1 - gap);
  return { slot, width, inset: (slot - width) / 2 };
};

function barRects(levels: number[], gap: number, segments: number): Rect[] {
  const layout = barLayout(levels.length, gap);
  return levels.flatMap((level, bar) => {
    const height = HEIGHT * segmentedLevel(level, segments);
    return mirroredRects(layout, bar, HEIGHT - height, height);
  });
}

function peakRects(peaks: number[], gap: number, segments: number): Rect[] {
  const layout = barLayout(peaks.length, gap);
  const markHeight = segments > 0 ? HEIGHT / segments : HEIGHT * PEAK_MARK;
  return peaks.flatMap((peak, bar) => {
    const top = HEIGHT * (1 - segmentedLevel(peak, segments));
    return mirroredRects(layout, bar, top, markHeight);
  });
}

/** Bar `bar` counted out from the center, once on each side. */
function mirroredRects({ slot, width, inset }: BarLayout, bar: number, y: number, height: number) {
  return [
    { x: CENTRE + bar * slot + inset, y, width, height },
    { x: CENTRE - (bar + 1) * slot + inset, y, width, height },
  ];
}

/**
 * Horizontal dark lines that cut every bar into cells, aligned to the bottom edge. The fills are
 * inline styles because a theme's `.sc-spectrum rect` rule would otherwise repaint the mask too.
 */
function CellMask({ id, segments }: { id: string; segments: number }) {
  const cell = HEIGHT / segments;
  return (
    <defs>
      <pattern id={`${id}-cells`} width={WIDTH} height={cell} patternUnits="userSpaceOnUse">
        <rect
          y={cell * CELL_GAP}
          width={WIDTH}
          height={cell * (1 - CELL_GAP)}
          style={{ fill: '#fff' }}
        />
      </pattern>
      <mask id={id}>
        <rect width={WIDTH} height={HEIGHT} style={{ fill: `url(#${id}-cells)` }} />
      </mask>
    </defs>
  );
}

/** The lit part of every cell a bar fills, as the cell mask shows it. */
function cellRects(bar: Rect, segments: number): Rect[] {
  if (segments === 0) return [bar];
  const cell = HEIGHT / segments;
  const count = Math.round(bar.height / cell);
  return Array.from({ length: count }, (_, index) => ({
    ...bar,
    y: HEIGHT - (index + 1) * cell + cell * CELL_GAP,
    height: cell * (1 - CELL_GAP),
  }));
}

const corners = ({ x, y, width, height }: Rect): Point[] => [
  { x, y },
  { x: x + width, y },
  { x: x + width, y: y + height },
  { x, y: y + height },
];

const barsOutline =
  (bars: Rect[], segments: number): Outline =>
  (toStage) =>
    bars
      .flatMap((bar) => cellRects(bar, segments))
      .map((cell) => polygonPath(corners(cell).map(toStage)))
      .join(' ');

/** The line through the bar tops, mirrored like the bars, out to both edges. */
function linePoints(levels: number[]): Point[] {
  const slot = CENTRE / levels.length;
  const right = levels.map((level, bar) => ({
    x: CENTRE + (bar + 0.5) * slot,
    y: HEIGHT * (1 - level),
  }));
  const left = right.map(({ x, y }) => ({ x: WIDTH - x, y })).reverse();
  const edge = right.at(-1)!.y;
  return [{ x: 0, y: edge }, ...left, ...right, { x: WIDTH, y: edge }];
}

const areaOutline =
  (line: Point[]): Outline =>
  (toStage) =>
    areaPath(line.map(toStage), BASE.map(toStage));

/** One smooth line through the bar tops over the area beneath it. */
function SpectrumLine({ line }: { line: Point[] }) {
  return (
    <>
      <path className="sc-spectrum-area" d={areaPath(line, BASE)} />
      <path className="sc-spectrum-line" d={smoothPath(line)} />
    </>
  );
}

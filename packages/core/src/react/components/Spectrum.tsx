import { useId } from 'react';
import { level, sampleBins, segmentedLevel, type AudioFeatures } from '../../audio.ts';
import { SpectrumConfigSchema, type SpectrumConfig } from '../../visualizers.ts';
import { useFrame } from '../frame.tsx';
import { usePeaks } from './history.ts';
import { smoothPath } from './svg.ts';

export { SpectrumConfigSchema, type SpectrumConfig };

const WIDTH = 1000;
const HEIGHT = 100;
const CENTRE = WIDTH / 2;
/** Share of each cell left dark when bars are split into segments. */
const CELL_GAP = 0.3;
/** Height of a peak marker on solid bars, as a share of the full height. */
const PEAK_MARK = 0.02;

/**
 * Mirrored bars, bass at the center. SVG so themes style it with CSS: `.sc-spectrum-bars rect`
 * for bars, `.sc-spectrum-peaks rect` for their peak markers, `.sc-spectrum-line` and
 * `.sc-spectrum-area` for `style: line`.
 */
export function Spectrum({ config }: { config: SpectrumConfig }) {
  const { audio } = useFrame();
  const { style, bars, gain, floor } = config;
  const levelsOf = (features: AudioFeatures) =>
    sampleBins(features.bins, bars).map((bin) => level(bin, gain, floor));
  const levels = levelsOf(audio);
  const peaks = usePeaks(config.peak, levels, levelsOf);

  return (
    <svg
      className="sc-spectrum"
      data-style={style}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
    >
      {style === 'line' ? (
        <SpectrumLine levels={levels} />
      ) : (
        <SpectrumBars levels={levels} peaks={peaks} gap={config.gap} segments={config.segments} />
      )}
    </svg>
  );
}

interface SpectrumBarsProps {
  levels: number[];
  /** One per level, or empty when the spectrum holds no peaks. */
  peaks: number[];
  gap: number;
  segments: number;
}

function SpectrumBars({ levels, peaks, gap, segments }: SpectrumBarsProps) {
  const maskId = useId();
  const mask = segments > 0 ? `url(#${maskId})` : undefined;
  const markHeight = segments > 0 ? HEIGHT / segments : HEIGHT * PEAK_MARK;
  const layout = barLayout(levels.length, gap);

  const bars = levels.flatMap((level, bar) => {
    const height = HEIGHT * segmentedLevel(level, segments);
    return mirroredRects(layout, bar, HEIGHT - height, height);
  });
  const marks = peaks.flatMap((peak, bar) => {
    const top = HEIGHT * (1 - segmentedLevel(peak, segments));
    return mirroredRects(layout, bar, top, markHeight);
  });

  return (
    <>
      {segments > 0 && <CellMask id={maskId} segments={segments} />}
      <g className="sc-spectrum-bars" mask={mask}>
        {bars}
      </g>
      {marks.length > 0 && (
        <g className="sc-spectrum-peaks" mask={mask}>
          {marks}
        </g>
      )}
    </>
  );
}

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

/** Bar `bar` counted out from the center, once on each side. */
function mirroredRects({ slot, width, inset }: BarLayout, bar: number, y: number, height: number) {
  const right = CENTRE + bar * slot + inset;
  const left = CENTRE - (bar + 1) * slot + inset;
  return [
    <rect key={`r${bar}`} x={right} y={y} width={width} height={height} />,
    <rect key={`l${bar}`} x={left} y={y} width={width} height={height} />,
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

/** One smooth line through the bar tops, mirrored like the bars, over the area beneath it. */
function SpectrumLine({ levels }: { levels: number[] }) {
  const slot = CENTRE / levels.length;
  const right = levels.map((level, bar) => ({
    x: CENTRE + (bar + 0.5) * slot,
    y: HEIGHT * (1 - level),
  }));
  const left = right.map(({ x, y }) => ({ x: WIDTH - x, y })).reverse();
  const edge = right.at(-1)!.y;
  const line = smoothPath([{ x: 0, y: edge }, ...left, ...right, { x: WIDTH, y: edge }]);

  return (
    <>
      <path className="sc-spectrum-area" d={`${line} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`} />
      <path className="sc-spectrum-line" d={line} />
    </>
  );
}

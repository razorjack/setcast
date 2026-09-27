import { useId } from 'react';
import { level, sampleBins, segmentedLevel } from '../../audio.ts';
import { SpectrumConfigSchema, type SpectrumConfig } from '../../visualizers.ts';
import { useFrame } from '../frame.tsx';
import { smoothPath } from './svg.ts';

export { SpectrumConfigSchema, type SpectrumConfig };

const WIDTH = 1000;
const HEIGHT = 100;
const CENTRE = WIDTH / 2;
/** Share of each cell left dark when bars are split into segments. */
const CELL_GAP = 0.3;

/**
 * Mirrored bars, bass at the center. SVG so themes style it with CSS: `.sc-spectrum rect` for
 * bars, `.sc-spectrum-line` and `.sc-spectrum-area` for `style: line`.
 */
export function Spectrum({ config }: { config: SpectrumConfig }) {
  const { audio } = useFrame();
  const { style, bars, gain, floor } = config;
  const levels = sampleBins(audio.bins, bars).map((bin) => level(bin, gain, floor));

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
        <SpectrumBars levels={levels} gap={config.gap} segments={config.segments} />
      )}
    </svg>
  );
}

interface SpectrumBarsProps {
  levels: number[];
  gap: number;
  segments: number;
}

function SpectrumBars({ levels, gap, segments }: SpectrumBarsProps) {
  const maskId = useId();
  const slot = CENTRE / levels.length;
  const barWidth = slot * (1 - gap);
  const inset = (slot - barWidth) / 2;

  const rects = [];
  for (let bar = 0; bar < levels.length; bar++) {
    const height = HEIGHT * segmentedLevel(levels[bar]!, segments);
    const y = HEIGHT - height;
    const right = CENTRE + bar * slot + inset;
    const left = CENTRE - (bar + 1) * slot + inset;
    rects.push(
      <rect key={`r${bar}`} x={right} y={y} width={barWidth} height={height} />,
      <rect key={`l${bar}`} x={left} y={y} width={barWidth} height={height} />,
    );
  }

  if (segments === 0) return rects;
  return (
    <>
      <CellMask id={maskId} segments={segments} />
      <g mask={`url(#${maskId})`}>{rects}</g>
    </>
  );
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

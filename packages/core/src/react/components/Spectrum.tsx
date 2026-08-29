import { level, sampleBins } from '../../audio.ts';
import { SpectrumConfigSchema, type SpectrumConfig } from '../../visualizers.ts';
import { useFrame } from '../frame.tsx';

export { SpectrumConfigSchema, type SpectrumConfig };

const WIDTH = 1000;
const HEIGHT = 100;
const CENTRE = WIDTH / 2;

/** Mirrored bars, bass at the center. SVG so themes style it with CSS (`.sc-spectrum rect`). */
export function Spectrum({ config }: { config: SpectrumConfig }) {
  const { audio } = useFrame();
  const { bars, gain, floor, gap } = config;
  const values = sampleBins(audio.bins, bars);
  const slot = CENTRE / bars;
  const barWidth = slot * (1 - gap);
  const inset = (slot - barWidth) / 2;

  const rects = [];
  for (let bar = 0; bar < bars; bar++) {
    const height = HEIGHT * level(values[bar]!, gain, floor);
    const y = HEIGHT - height;
    const right = CENTRE + bar * slot + inset;
    const left = CENTRE - (bar + 1) * slot + inset;
    rects.push(
      <rect key={`r${bar}`} x={right} y={y} width={barWidth} height={height} />,
      <rect key={`l${bar}`} x={left} y={y} width={barWidth} height={height} />,
    );
  }

  return (
    <svg className="sc-spectrum" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
      {rects}
    </svg>
  );
}

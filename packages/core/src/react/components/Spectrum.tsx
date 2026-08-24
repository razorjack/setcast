import { sampleBins } from '../../audio.ts';
import { SpectrumConfigSchema, type SpectrumConfig } from '../../visualizers.ts';
import { useFrame } from '../frame.tsx';

export { SpectrumConfigSchema, type SpectrumConfig };

const W = 1000;
const H = 100;

/** Mirrored bars, bass at the center. SVG so themes style it with CSS (`.sc-spectrum rect`). */
export function Spectrum({ config }: { config: SpectrumConfig }) {
  const { audio } = useFrame();
  const { bars, gain, floor, gap } = config;
  const values = sampleBins(audio.bins, bars);
  const slot = W / (bars * 2);
  const w = slot * (1 - gap);
  const rects = [];
  for (let i = 0; i < bars; i++) {
    const h = H * Math.max(floor, Math.min(1, values[i]! * gain));
    const y = H - h;
    rects.push(
      <rect key={`r${i}`} x={W / 2 + i * slot + (slot - w) / 2} y={y} width={w} height={h} />,
      <rect key={`l${i}`} x={W / 2 - (i + 1) * slot + (slot - w) / 2} y={y} width={w} height={h} />,
    );
  }
  return (
    <svg className="sc-spectrum" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {rects}
    </svg>
  );
}

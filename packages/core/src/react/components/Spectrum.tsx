import { z } from 'zod';
import { useFrame } from '../frame.tsx';

export const SpectrumConfigSchema = z.object({
  name: z.literal('spectrum').default('spectrum'),
  /** Bars per side; the picture is mirrored around the center (bass in the middle). */
  bars: z.number().int().min(8).max(64).default(48),
  gain: z.number().min(0.1).max(4).default(1),
  /** Minimum bar height as a fraction of the full height, so silence still shows a baseline. */
  floor: z.number().min(0).max(0.5).default(0.02),
  gap: z.number().min(0).max(0.9).default(0.5),
});
export type SpectrumConfig = z.infer<typeof SpectrumConfigSchema>;

const W = 1000;
const H = 100;

/** Mirrored bars, bass at the center. SVG so themes style it with CSS (`.sc-spectrum rect`). */
export function Spectrum({ config }: { config: SpectrumConfig }) {
  const { audio } = useFrame();
  const { bars, gain, floor, gap } = config;
  const values = resample(audio.bins, bars);
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

function resample(bins: readonly number[], count: number): number[] {
  if (bins.length === count) return [...bins];
  return Array.from({ length: count }, (_, i) => {
    const pos = (i / count) * bins.length;
    const a = Math.floor(pos);
    const b = Math.min(bins.length - 1, a + 1);
    const t = pos - a;
    return bins[a]! * (1 - t) + bins[b]! * t;
  });
}

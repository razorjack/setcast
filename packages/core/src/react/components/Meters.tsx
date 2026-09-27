import type { CSSProperties } from 'react';
import { level, segmentedLevel, type AudioFeatures, type FeatureSource } from '../../audio.ts';
import { MetersConfigSchema, type MetersConfig } from '../../visualizers.ts';
import { useFrame } from '../frame.tsx';
import { usePeaks } from './history.ts';

export { MetersConfigSchema, type MetersConfig };

/**
 * One level meter per audio feature. Plain HTML: each `.sc-meter` carries its level as `--level`
 * (0..1), so a theme draws the whole meter in CSS. base.css cuts `.sc-meter-bar` into
 * `--segments` cells when `segments` is not 0. With `peak`, `.sc-meter-peak` sits at `--peak`.
 */
export function Meters({ config }: { config: MetersConfig }) {
  const { audio } = useFrame();
  const { bands, gain, floor, segments } = config;
  const levelsOf = (features: AudioFeatures) =>
    bands.map((band) => level(features[band], gain, floor));
  const levels = levelsOf(audio);
  const peaks = usePeaks(config.peak, levels, levelsOf);
  const peakCell = (peak: number | undefined) =>
    peak === undefined ? undefined : segmentedLevel(peak, segments);

  return (
    <div className="sc-meters" data-segmented={segments > 0} style={{ '--segments': segments }}>
      {bands.map((band, index) => (
        <Meter
          key={index}
          band={band}
          level={segmentedLevel(levels[index]!, segments)}
          peak={peakCell(peaks[index])}
        />
      ))}
    </div>
  );
}

interface MeterProps {
  band: FeatureSource;
  level: number;
  /** Undefined when the meters hold no peaks. */
  peak: number | undefined;
}

function Meter({ band, level, peak }: MeterProps) {
  const style: CSSProperties = { '--level': level };
  if (peak !== undefined) style['--peak'] = peak;

  return (
    <div className="sc-meter" data-band={band} style={style}>
      <span className="sc-meter-bar">
        <span className="sc-meter-level" />
        {peak !== undefined && <span className="sc-meter-peak" />}
      </span>
      <span className="sc-meter-label">{band}</span>
    </div>
  );
}

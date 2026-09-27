import { level, segmentedLevel, type FeatureSource } from '../../audio.ts';
import { MetersConfigSchema, type MetersConfig } from '../../visualizers.ts';
import { useFrame } from '../frame.tsx';

export { MetersConfigSchema, type MetersConfig };

/**
 * One level meter per audio feature. Plain HTML: each `.sc-meter` carries its level as `--level`
 * (0..1), so a theme draws the whole meter in CSS. base.css cuts `.sc-meter-bar` into
 * `--segments` cells when `segments` is not 0.
 */
export function Meters({ config }: { config: MetersConfig }) {
  const { audio } = useFrame();
  const { bands, gain, floor, segments } = config;
  const levelOf = (band: FeatureSource) =>
    segmentedLevel(level(audio[band], gain, floor), segments);

  return (
    <div className="sc-meters" data-segmented={segments > 0} style={{ '--segments': segments }}>
      {bands.map((band, index) => (
        <Meter key={index} band={band} level={levelOf(band)} />
      ))}
    </div>
  );
}

function Meter({ band, level }: { band: FeatureSource; level: number }) {
  return (
    <div className="sc-meter" data-band={band} style={{ '--level': level }}>
      <span className="sc-meter-bar">
        <span className="sc-meter-level" />
      </span>
      <span className="sc-meter-label">{band}</span>
    </div>
  );
}

import type { CSSProperties } from 'react';
import { currentBackground, isVideoFile } from '../../stage.ts';
import { useFrame } from '../frame.tsx';
import { Img, Video } from '../renderer.tsx';

export function Background() {
  const { timeSeconds, mix, composition } = useFrame();
  const current = currentBackground(mix, composition.project.background);
  return (
    <div className="sc-bg" style={drift(timeSeconds)}>
      {current && <Layer src={current} className="sc-bg-img" />}
      <div className="sc-bg-vignette" />
    </div>
  );
}

/** Three slow, mutually prime cycles, so the picture never quite repeats. */
function drift(timeSeconds: number): CSSProperties {
  return {
    '--bg-drift': 1.04 + 0.02 * Math.sin(timeSeconds / 23),
    '--bg-x': `${1.2 * Math.sin(timeSeconds / 31)}%`,
    '--bg-y': `${0.8 * Math.cos(timeSeconds / 37)}%`,
  };
}

const Layer = ({ src, className }: { src: string; className: string }) =>
  isVideoFile(src) ? (
    <Video className={className} src={src} loop muted />
  ) : (
    <Img className={className} src={src} />
  );

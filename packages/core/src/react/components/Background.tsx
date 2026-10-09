import type { CSSProperties } from 'react';
import { useFrame } from '../frame.tsx';
import { Img, Video } from '../renderer.tsx';

const VIDEO_FILE = /\.(mp4|mov|webm|mkv|m4v)$/i;

/** The first focused play supplies its art; an empty focus uses the project background. */
export function Background() {
  const { timeSeconds, mix, composition } = useFrame();
  const current = mix.focusPlays[0]?.play.background ?? composition.project.background;
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
  VIDEO_FILE.test(src) ? (
    <Video className={className} src={src} loop muted />
  ) : (
    <Img className={className} src={src} />
  );

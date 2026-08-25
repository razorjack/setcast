import { useFrame } from '../frame.tsx';
import { Img, Video } from '../renderer.tsx';

const VIDEO = /\.(mp4|mov|webm|mkv|m4v)$/i;

/**
 * Full-bleed background with a slow drift, from an image or a looping video. CSS receives
 * `--bg-drift`, `--bg-x` and `--bg-y` and owns the transform, which multiplies the drift by
 * `--mod-bg-zoom` like any other modulation. A track with its own `background` replaces the
 * set's; the one before stays underneath as `.sc-bg-out` while the new one, `.sc-bg-in`, fades
 * up over `--bg-fade` seconds of `--since-track`.
 */
export function Background() {
  const { timeSeconds: t, events, composition } = useFrame();
  const drift = 1.04 + 0.02 * Math.sin(t / 23);
  const x = 1.2 * Math.sin(t / 31);
  const y = 0.8 * Math.cos(t / 37);
  const base = composition.project.background;
  const tracks = events.all.filter((e) => e.type === 'track_start');
  const src = events.track?.background ?? base;
  const before = events.trackIndex > 0 ? (tracks[events.trackIndex - 1]?.background ?? base) : src;
  return (
    <div className="sc-bg" style={{ '--bg-drift': drift, '--bg-x': `${x}%`, '--bg-y': `${y}%` }}>
      {before !== src && before && <Layer src={before} className="sc-bg-img sc-bg-out" />}
      {src && <Layer src={src} className={`sc-bg-img${before !== src ? ' sc-bg-in' : ''}`} />}
      <div className="sc-bg-vignette" />
    </div>
  );
}

const Layer = ({ src, className }: { src: string; className: string }) =>
  VIDEO.test(src) ? (
    <Video className={className} src={src} loop muted />
  ) : (
    <Img className={className} src={src} />
  );

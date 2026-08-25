import { useFrame } from '../frame.tsx';
import { Img, Video } from '../renderer.tsx';

const VIDEO = /\.(mp4|mov|webm|mkv|m4v)$/i;

/**
 * Full-bleed background with a slow drift, from an image or a looping video. CSS receives
 * `--bg-drift`, `--bg-x` and `--bg-y` and owns the transform, which multiplies the drift by
 * `--mod-bg-zoom` like any other modulation.
 */
export function Background() {
  const { timeSeconds: t, composition } = useFrame();
  const drift = 1.04 + 0.02 * Math.sin(t / 23);
  const x = 1.2 * Math.sin(t / 31);
  const y = 0.8 * Math.cos(t / 37);
  const src = composition.project.background;
  return (
    <div className="sc-bg" style={{ '--bg-drift': drift, '--bg-x': `${x}%`, '--bg-y': `${y}%` }}>
      {src &&
        (VIDEO.test(src) ? (
          <Video className="sc-bg-img" src={src} loop muted />
        ) : (
          <Img className="sc-bg-img" src={src} />
        ))}
      <div className="sc-bg-vignette" />
    </div>
  );
}

import { useFrame } from '../frame.tsx';
import { Img } from '../renderer.tsx';

/**
 * Full-bleed background with a slow drift. Zoom = drift × `--mod-bg-zoom` (if a route drives it).
 * CSS receives `--bg-zoom`, `--bg-x`, `--bg-y` and owns the transform.
 */
export function Background() {
  const { timeSeconds: t, composition, modulation } = useFrame();
  const drift = 1.04 + 0.02 * Math.sin(t / 23);
  const zoom = drift * (modulation['bg-zoom'] ?? 1);
  const x = 1.2 * Math.sin(t / 31);
  const y = 0.8 * Math.cos(t / 37);
  const src = composition.project.background;
  return (
    <div className="sc-bg" style={{ '--bg-zoom': zoom, '--bg-x': `${x}%`, '--bg-y': `${y}%` }}>
      {src && <Img className="sc-bg-img" src={src} />}
      <div className="sc-bg-vignette" />
    </div>
  );
}

import type { CSSProperties } from 'react';
import type { EventState } from '../../timeline.ts';
import { useFrame } from '../frame.tsx';
import { Img, Video } from '../renderer.tsx';

const VIDEO_FILE = /\.(mp4|mov|webm|mkv|m4v)$/i;

/**
 * Full-bleed background with a slow drift, from an image or a looping video. CSS receives
 * `--bg-drift`, `--bg-x` and `--bg-y` and owns the transform, which multiplies the drift by
 * `--mod-bg-zoom` like any other modulation. A track with its own `background` replaces the
 * set's; the one before stays underneath as `.sc-bg-out` while the new one, `.sc-bg-in`, fades
 * up over `--bg-fade` seconds of `--since-track`.
 */
export function Background() {
  const { timeSeconds, events, composition } = useFrame();
  const setArt = composition.project.background;

  const current = events.track?.background ?? setArt;
  const previous = events.trackIndex > 0 ? previousTrackArt(events, setArt) : current;
  const changed = previous !== current;

  return (
    <div className="sc-bg" style={drift(timeSeconds)}>
      {changed && previous && <Layer src={previous} className="sc-bg-img sc-bg-out" />}
      {current && <Layer src={current} className={changed ? 'sc-bg-img sc-bg-in' : 'sc-bg-img'} />}
      <div className="sc-bg-vignette" />
    </div>
  );
}

/** What the track before this one showed, so the crossfade has something to leave from. */
function previousTrackArt(events: EventState, setArt: string | null): string | null {
  const tracks = events.all.filter((event) => event.type === 'track_start');
  return tracks[events.trackIndex - 1]?.background ?? setArt;
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

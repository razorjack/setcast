import { ease, interpolate, spring } from '../../motion.ts';
import { since } from '../../timeline.ts';
import { useFrame } from '../frame.tsx';

/**
 * Frosted-glass panel with the active track. `--show` is how present the panel is: it springs in
 * on a track change, holds for `panel.dwell` seconds and leaves over `panel.fade`.
 */
export function NowPlaying() {
  const { composition, events, timeSeconds: t } = useFrame();
  const track = events.track;
  if (!track) return null;
  const { dwell, fade } = composition.project.panel;
  const age = since(events, 'track_start', t);
  const enter = spring(age, { stiffness: 110, damping: 15 });
  const leave =
    dwell > 0 ? interpolate(age, [dwell, dwell + fade], [1, 0], { easing: ease.inOut }) : 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <section className="sc-panel" style={{ '--show': enter * leave }} data-deck={track.deck}>
      <header className="sc-panel-head">
        {track.deck && <span className="sc-deck">{track.deck}</span>}
        <span className="sc-eyebrow">Now playing</span>
        <span className="sc-index">
          {pad(events.trackIndex + 1)}
          <span className="sc-index-sep">/</span>
          {pad(events.trackCount)}
        </span>
      </header>
      <p className="sc-artist">{track.artist}</p>
      <h1 className="sc-title">{track.title}</h1>
      {track.label && <p className="sc-label">{track.label}</p>}
    </section>
  );
}

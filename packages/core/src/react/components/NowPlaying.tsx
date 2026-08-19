import { spring } from '../../motion.ts';
import { since } from '../../timeline.ts';
import { useFrame } from '../frame.tsx';

/** Frosted-glass panel with the active track. `--enter` (0..1) animates each track change. */
export function NowPlaying() {
  const { events, timeSeconds: t } = useFrame();
  const track = events.track;
  if (!track) return null;
  const enter = spring(since(events, 'track_start', t), { stiffness: 110, damping: 15 });
  const total = events.all.filter((e) => e.type === 'track_start').length;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <section className="sc-panel" style={{ '--enter': enter }} data-deck={track.deck ?? ''}>
      <header className="sc-panel-head">
        {track.deck && <span className="sc-deck">{track.deck}</span>}
        <span className="sc-eyebrow">Now playing</span>
        <span className="sc-index">
          {pad(events.trackIndex + 1)}
          <span className="sc-index-sep">/</span>
          {pad(total)}
        </span>
      </header>
      <p className="sc-artist">{track.artist}</p>
      <h1 className="sc-title">{track.title}</h1>
      {track.label && <p className="sc-label">{track.label}</p>}
    </section>
  );
}

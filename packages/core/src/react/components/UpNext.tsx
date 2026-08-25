import { useFrame } from '../frame.tsx';

/**
 * The track after this one. It is rendered for the whole track; the theme decides when it becomes
 * visible by shaping `--until-track` from the stage root.
 */
export function UpNext() {
  const { events } = useFrame();
  const next = events.next.track_start;
  if (!next) return null;
  return (
    <aside className="sc-next">
      <span className="sc-next-label">Up next</span>
      <span className="sc-next-artist">{next.artist}</span>
      <span className="sc-next-title">{next.title}</span>
    </aside>
  );
}

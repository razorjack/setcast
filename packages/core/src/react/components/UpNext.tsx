import { useFrame } from '../frame.tsx';

export function UpNext() {
  const { mix, composition } = useFrame();
  const { project } = composition;
  const dj = project.presentation === 'dj';
  const next = dj ? mix.nextEntries : mix.nextListings;
  if (!next.length) return null;
  const at = 'from' in next[0]! ? next[0].from : next[0]!.at;
  const titles = next.map((entry) => {
    const play = project.mix.plays.find((play) => play.id === entry.play)!;
    const recording = project.mix.recordings.find((recording) => recording.id === play.recording)!;
    return recording.artist ? `${recording.artist} - ${recording.title}` : recording.title;
  });
  const returning = dj && mix.nextEntries.every((entry) => entry.returning);
  let label = 'Next in tracklist';
  if (dj) label = returning ? 'Returning' : 'Next entry';
  return (
    <aside className="sc-next" style={{ '--until-next': (at - mix.time) / 1_000_000 }}>
      <span className="sc-next-label">{label}</span>
      <span className="sc-next-title">{titles.join(' / ')}</span>
    </aside>
  );
}

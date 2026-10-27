import type { MixDocument } from '../../mix-schema.ts';
import { useFrame } from '../frame.tsx';
import { toSeconds } from '../../time.ts';

export function UpNext() {
  const { mix, composition } = useFrame();
  const { project } = composition;
  if (!project.mix) return null;
  const dj = project.presentation === 'dj';
  const next = dj ? mix.nextEntries : mix.nextListings;
  if (!next.length) return null;
  const at = 'from' in next[0]! ? next[0].from : next[0]!.at;
  const returning = dj && mix.nextEntries.every((entry) => entry.returning);
  let label = 'Next in tracklist';
  if (dj) label = returning ? 'Returning' : 'Next entry';
  return (
    <aside className="sc-next" style={{ '--until-next': toSeconds(at - mix.time) }}>
      <span className="sc-next-label">{label}</span>
      {next.map((entry) => (
        <NextCredit key={entry.play} document={project.mix} play={entry.play} />
      ))}
    </aside>
  );
}

function NextCredit({ document, play: playId }: { document: MixDocument; play: string }) {
  const play = document.plays.find((play) => play.id === playId)!;
  const recording = document.recordings.find((recording) => recording.id === play.recording)!;
  return (
    <>
      {recording.artist && <span className="sc-next-artist">{recording.artist}</span>}
      <span className="sc-next-title">{recording.title}</span>
    </>
  );
}

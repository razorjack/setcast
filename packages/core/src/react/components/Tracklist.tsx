import { tracklistRowVars, tracklistVars } from '../../stage.ts';
import { formatTime } from '../../time.ts';
import { tracklistView, type TracklistRow, type TracklistCounts } from '../../tracklist.ts';
import { useFrame } from '../frame.tsx';
import { labelLine } from './credit.ts';
import { toSeconds } from '../../mix-schema.ts';

/** The listings around the current one; rows enter and leave through `--row-presence`. */
export function Tracklist({ counts }: { counts: TracklistCounts }) {
  const { mix, composition } = useFrame();
  const { project } = composition;
  if (!project.mix) return null;
  const view = tracklistView(project.mix, mix, counts);
  const digits = String(mix.listingCount).length;
  return (
    <section className="sc-tracklist" style={tracklistVars(view)}>
      <p className="sc-tracklist-heading">Tracklist</p>
      <ol className="sc-tracklist-rows">
        {view.rows.map((row) => (
          <Row key={row.listing.id} row={row} digits={digits} clockOffset={project.clockOffset} />
        ))}
      </ol>
    </section>
  );
}

function Row({
  row,
  digits,
  clockOffset,
}: {
  row: TracklistRow;
  digits: number;
  clockOffset: number;
}) {
  const { mix } = useFrame();
  const { recording, listing, current } = row;
  const label = labelLine(recording);
  return (
    <li
      className="sc-tracklist-row"
      data-play={listing.play}
      data-state={row.state}
      data-focused={row.focused}
      data-returning={row.returning}
      data-ahead={row.ahead}
      data-deck={row.deck}
      data-tail={current?.contribution.tail}
      data-tags={current?.contribution.tags?.join(' ')}
      style={tracklistRowVars(mix, row)}
    >
      <span className="sc-tracklist-index">{String(row.index + 1).padStart(digits, '0')}</span>
      <span className="sc-tracklist-time">{formatTime(clockOffset + toSeconds(listing.at))}</span>
      {recording.artist && <span className="sc-tracklist-artist">{recording.artist}</span>}
      <span className="sc-tracklist-title">{recording.title}</span>
      {label && <span className="sc-tracklist-label">{label}</span>}
    </li>
  );
}

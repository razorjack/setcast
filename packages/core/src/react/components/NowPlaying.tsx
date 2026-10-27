import { evaluateModulation, modulationVars } from '../../modulation.ts';
import { ease, interpolate, spring } from '../../motion.ts';
import type { ResolvedProject } from '../../project.ts';
import { playVars } from '../../stage.ts';
import type { CurrentPlay, MixState } from '../../timeline.ts';
import { tracklistView } from '../../tracklist.ts';
import { useFrame } from '../frame.tsx';
import { labelLine } from './credit.ts';
import { toSeconds } from '../../mix-schema.ts';

type PanelTiming = NonNullable<ResolvedProject['panel']>;
type PanelMotion = { show: number; presence: number; handedOver: number };
type Credit = { current: CurrentPlay; listed: number | null; motion: PanelMotion };

export function NowPlaying() {
  const { mix, composition, timeSeconds } = useFrame();
  const { project } = composition;
  const { panel } = project;
  // the empty stack stays, so a layout anchored to it keeps its place
  if (!panel || !project.mix) return <div className="sc-contributors" />;

  const dj = project.presentation === 'dj';
  const plays = dj ? mix.currentPlays : mix.focusPlays.slice(0, 1);
  const listing = listingOf(project, mix);
  const credits = plays.map((current): Credit => {
    const listed = listing(current.play.id);
    const motion = panelMotion(current.run, { timeSeconds, timing: panel, dj, listed });
    return { current, listed, motion };
  });
  // a play the tracklist has taken over needs neither a panel nor room in the stack
  const open = credits.filter((credit) => credit.motion.handedOver < 1);
  const capacity = composition.width < composition.height ? 3 : 4;
  const shown = withinCapacity(open, mix.focusPlays, capacity);
  return (
    <div className="sc-contributors" data-count={plays.length}>
      {dj && plays.length > 0 && (
        <p className="sc-contributor-count">
          {plays.length} contributing {plays.length === 1 ? 'play' : 'plays'}
        </p>
      )}
      {shown.map((credit) => (
        <PlayPanel key={credit.current.run.id} {...credit} />
      ))}
      {open.length > capacity && <Overflow hidden={open.length - capacity} plays={plays} />}
    </div>
  );
}

/** Focused plays first, in focus order, then the rest; the panels shown keep play order. */
function withinCapacity(
  credits: Credit[],
  focus: readonly CurrentPlay[],
  capacity: number,
): Credit[] {
  const rank = (credit: Credit) => {
    const index = focus.indexOf(credit.current);
    return index < 0 ? focus.length : index;
  };
  const visible = new Set(credits.toSorted((a, b) => rank(a) - rank(b)).slice(0, capacity));
  return credits.filter((credit) => visible.has(credit));
}

function Overflow({ hidden, plays }: { hidden: number; plays: readonly CurrentPlay[] }) {
  return (
    <div className="sc-overflow" aria-label="All contributors">
      <p>+{hidden} more contributing plays</p>
      <ul>
        {plays.map((play) => (
          <li key={play.play.id}>
            {play.recording.artist && `${play.recording.artist} - `}
            {play.recording.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * How far inside the tracklist's window a play's row is, 0..1: 0 when the list does not show the
 * play, null when there is no tracklist.
 */
function listingOf(project: ResolvedProject, mix: MixState): (play: string) => number | null {
  if (!project.tracklist) return () => null;
  const { rows } = tracklistView(project.mix, mix, project.tracklist);
  return (play) => rows.find((row) => row.listing.play === play)?.presence ?? 0;
}

const EXIT_SECONDS = 0.6;

function PlayPanel({ current, listed, motion }: Credit) {
  const frame = useFrame();
  const { mix, timeSeconds, composition, fps, analyzer } = frame;
  const { project } = composition;
  const { contribution, run, play } = current;
  const { show, presence } = motion;
  const modulation = evaluateModulation(project.modulation, {
    time: timeSeconds,
    fps,
    mix,
    play: current,
    analyzer,
    bpm: project.bpm,
    beatOffset: project.beatOffset,
  });
  const cues = playVars(mix, current);
  const focused = mix.focusPlays.some((entry) => entry.play.id === play.id);
  return (
    <div className="sc-slot" style={{ '--presence': presence }}>
      <section
        className="sc-panel"
        data-play={play.id}
        data-shared-drop={
          current.section?.kind === 'drop' && Number(cues['--drop-participants']) > 1
        }
        data-deck={contribution.deck}
        data-listed={listed === null ? undefined : listed > 0}
        data-section={current.section?.kind}
        data-focused={focused}
        data-returning={run.returning}
        data-tail={contribution.tail}
        data-tags={contribution.tags?.join(' ')}
        style={{ '--show': show, ...cues, ...modulationVars(modulation) }}
      >
        <PanelHead current={current} />
        <Credit current={current} />
      </section>
    </div>
  );
}

/**
 * `--show` springs in at run start, holds for `panel.dwell` and fades over `panel.fade`.
 * `--presence`, which themes animate, follows it in playlist mode. In DJ mode it holds for the
 * whole run and eases out at its end, unless the tracklist shows the play: the list then takes
 * over the credit once the dwell is up (`handedOver` reaches 1), and hands it back if the play's
 * row leaves the list. It sits on the slot, whose height follows it.
 */
export function panelMotion(
  run: Pick<CurrentPlay['run'], 'from' | 'until'>,
  options: { timeSeconds: number; timing: PanelTiming; dj: boolean; listed: number | null },
): PanelMotion {
  const { timeSeconds, timing, dj, listed } = options;
  const age = timeSeconds - toSeconds(run.from);
  const entrance = spring(age, { stiffness: 110, damping: 15 });
  const stays = stay(age, timing.dwell, timing.fade);
  const show = entrance * stays;
  if (!dj) return { show, presence: show, handedOver: 0 };

  const exit = leave(toSeconds(run.until) - timeSeconds);
  const handedOver = (listed ?? 0) * (1 - stays);
  return { show, presence: entrance * exit * (1 - handedOver), handedOver };
}

const stay = (age: number, dwell: number, fade: number): number => {
  if (dwell <= 0) return 1;
  if (fade === 0) return age < dwell ? 1 : 0;
  return interpolate(age, [dwell, dwell + fade], [1, 0], { easing: ease.inOut });
};

const leave = (remaining: number): number =>
  interpolate(remaining, [0, EXIT_SECONDS], [0, 1], { easing: ease.inOut });

function PanelHead({ current }: { current: CurrentPlay }) {
  const { mix, composition } = useFrame();
  const { contribution, run, play } = current;
  const listingIndex = mix.listings.findIndex((listing) => listing.play === play.id);
  return (
    <header className="sc-panel-head">
      {contribution.deck && <span className="sc-deck">{contribution.deck}</span>}
      <span className="sc-eyebrow">{run.returning ? 'Returning' : 'Now playing'}</span>
      {composition.project.presentation === 'playlist' && listingIndex >= 0 && (
        <span className="sc-index">
          Listing {listingIndex + 1} / {mix.listingCount}
        </span>
      )}
    </header>
  );
}

function Credit({ current }: { current: CurrentPlay }) {
  const { recording, contribution } = current;
  const label = labelLine(recording);
  return (
    <>
      {recording.artist && <p className="sc-artist">{recording.artist}</p>}
      <h1 className="sc-title">{recording.title}</h1>
      {label && <p className="sc-label">{label}</p>}
      {(contribution.tags?.length || contribution.parts?.length || contribution.tail) && (
        <p className="sc-credit-details">
          {[
            ...(contribution.tags ?? []),
            ...(contribution.parts ?? []),
            contribution.tail ? 'tail' : undefined,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </>
  );
}

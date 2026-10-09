import { evaluateModulation, modulationVars } from '../../modulation.ts';
import { ease, interpolate, spring } from '../../motion.ts';
import { playVars } from '../../stage.ts';
import type { CurrentPlay } from '../../timeline.ts';
import { useFrame } from '../frame.tsx';

export function NowPlaying() {
  const { mix, composition } = useFrame();
  const dj = composition.project.presentation === 'dj';
  const plays = dj ? mix.currentPlays : mix.focusPlays.slice(0, 1);
  const capacity = composition.width < composition.height ? 3 : 4;
  const priority = [...mix.focusPlays, ...plays.filter((play) => !mix.focusPlays.includes(play))];
  const visible = new Set(priority.slice(0, capacity));
  const shown = plays.filter((play) => visible.has(play));
  return (
    <div className="sc-contributors" data-count={plays.length}>
      {dj && plays.length > 0 && (
        <p className="sc-contributor-count">
          {plays.length} contributing {plays.length === 1 ? 'play' : 'plays'}
        </p>
      )}
      {shown.map((play) => (
        <PlayPanel key={play.run.id} current={play} />
      ))}
      {plays.length > capacity && (
        <div className="sc-overflow" aria-label="All contributors">
          <p>+{plays.length - capacity} more contributing plays</p>
          <ul>
            {plays.map((play) => (
              <li key={play.play.id}>
                {play.recording.artist && `${play.recording.artist} - `}
                {play.recording.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const EXIT_SECONDS = 0.6;

/**
 * `--show` springs in at run start, holds for `panel.dwell` and fades over `panel.fade`.
 * `--presence`, which themes animate, follows it in playlist mode; in DJ mode it holds for the
 * whole run and eases out at its end. It sits on the slot, whose height follows it.
 */
function PlayPanel({ current }: { current: CurrentPlay }) {
  const frame = useFrame();
  const { mix, timeSeconds, composition, fps, analyzer } = frame;
  const { project } = composition;
  const { contribution, run, play } = current;
  const age = timeSeconds - run.from / 1_000_000;
  const entrance = spring(age, { stiffness: 110, damping: 15 });
  const show = entrance * stay(age, project.panel.dwell, project.panel.fade);
  const exit = leave(run.until / 1_000_000 - timeSeconds);
  const presence = project.presentation === 'dj' ? entrance * exit : show;
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
  return (
    <>
      {recording.artist && <p className="sc-artist">{recording.artist}</p>}
      <h1 className="sc-title">{recording.title}</h1>
      {(recording.label || recording.version) && (
        <p className="sc-label">
          {[recording.label, recording.version].filter(Boolean).join(' · ')}
        </p>
      )}
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

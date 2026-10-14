import { backgroundKind } from './background.ts';
import { clamp } from './motion.ts';
import {
  lastAnnotations,
  sinceAnnotation,
  untilAnnotation,
  type MixState,
  type CurrentPlay,
} from './timeline.ts';
import type { TracklistRow, TracklistView } from './tracklist.ts';

export const SECONDS_CAP = 60;
export const stageData = (state: MixState, background: string | null) => ({
  'data-section': state.mixSection?.kind,
  'data-current-plays': state.currentPlayCount,
  'data-shared-drop':
    state.mixSection?.kind === 'drop' &&
    (lastAnnotations(state, 'drop')[0]?.participants?.length ?? 0) > 1,
  'data-background': backgroundKind(background),
});

export function cueVars(state: MixState, play?: CurrentPlay): Record<string, string> {
  const scope = play ? { play: play.play.id } : undefined;
  const vars: Record<string, string> = {};
  for (const kind of ['drop', 'breakdown', 'buildup', 'rewind']) {
    vars[`--since-${kind}`] = cssSeconds(sinceAnnotation(state, kind, scope, play?.run));
    vars[`--until-${kind}`] = cssSeconds(untilAnnotation(state, kind, scope, play?.run));
  }
  const previousDrop = lastAnnotations(state, 'drop', scope)[0];
  const drop =
    previousDrop && (!play || previousDrop.at >= play.run.from) ? previousDrop : undefined;
  vars['--drop-intensity'] = cssNumber(drop?.kind === 'drop' ? drop.intensity : 0);
  vars['--drop-participants'] = String(drop?.participants?.length ?? 0);
  const section = play ? play.section : state.mixSection;
  vars['--section-time'] = cssSeconds(
    section ? (state.time - section.start) / 1_000_000 : Infinity,
  );
  return vars;
}

export function stageVars(state: MixState, time: number, duration: number): Record<string, string> {
  return {
    ...cueVars(state),
    '--set-progress': cssNumber(duration > 0 ? clamp(time / duration, 0, 1) : 0),
    '--current-plays': String(state.currentPlayCount),
  };
}

export function playVars(state: MixState, play: CurrentPlay): Record<string, string> {
  return {
    ...cueVars(state, play),
    ...runVars(state, play),
    '--play-order': String(play.play.order),
  };
}

const runVars = (state: MixState, play: CurrentPlay): Record<string, string> => ({
  '--since-entry': cssSeconds((state.time - play.run.from) / 1_000_000),
  '--until-exit': cssSeconds((play.run.until - state.time) / 1_000_000),
});

export function tracklistVars(view: TracklistView): Record<string, string> {
  return {
    '--since-listing': cssSeconds(view.sinceListing),
    '--until-listing': cssSeconds(view.untilListing),
  };
}

/** A current row also times its play's run, as its panel does. */
export function tracklistRowVars(state: MixState, row: TracklistRow): Record<string, string> {
  const vars = {
    '--row-offset': cssNumber(row.offset),
    '--row-presence': cssNumber(row.presence),
    '--row-progress': cssNumber(row.progress),
  };
  if (!row.current) return vars;
  return { ...vars, ...runVars(state, row.current) };
}

/**
 * Where in the beat and in the (four-beat) bar `time` falls, 0..1, as `--beat` and `--bar`, so a
 * theme can pulse on the grid without JS. Nothing when the project states no tempo.
 */
export function beatVars(time: number, bpm: number | null, offset = 0): Record<string, string> {
  if (!bpm) return {};
  const { beat, bar } = beatPhase(time, bpm, offset);
  return { '--beat': cssNumber(beat), '--bar': cssNumber(bar) };
}

/** 0..1 through the current beat and the current four-beat bar. */
export function beatPhase(time: number, bpm: number, offset = 0): { beat: number; bar: number } {
  const beats = ((time - offset) * bpm) / 60;
  return { beat: phase(beats), bar: phase(beats / 4) };
}

/** How far through the current turn `elapsed` sits, 0..1, for a negative count too. */
const phase = (elapsed: number) => ((elapsed % 1) + 1) % 1;

const cssNumber = (value: number) => String(Math.round(value * 1000) / 1000);
const cssSeconds = (seconds: number) => cssNumber(Math.min(seconds, SECONDS_CAP));

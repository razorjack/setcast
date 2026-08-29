import type { EventType } from './events.ts';
import { clamp } from './motion.ts';
import { lastEvent, since, until, type EventState } from './timeline.ts';

/**
 * Seconds handed to CSS are capped here. A custom property cannot hold Infinity, and every effect
 * a theme would write treats "a minute ago" and "never" the same way.
 */
export const SECONDS_CAP = 60;

/** Stage-root attributes, so CSS can select on the current section and the deck in front. */
export const stageData = (state: EventState) => ({
  'data-section': state.section ?? undefined,
  'data-deck': state.deck ?? undefined,
});

/** Event types that get `--since-<name>` and `--until-<name>`. Double drops count as drops. */
const TIMED_EVENTS: [type: EventType, cssName: string][] = [
  ['track_start', 'track'],
  ['drop', 'drop'],
  ['breakdown', 'breakdown'],
  ['buildup', 'buildup'],
  ['rewind', 'rewind'],
];

/**
 * Stage-root custom properties: the event timeline as numbers CSS can do arithmetic with.
 * `--since-*` and `--until-*` are seconds capped at `SECONDS_CAP`; `--drop-intensity` and
 * `--set-progress` are 0..1.
 */
export function stageVars(
  state: EventState,
  time: number,
  duration: number,
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [type, cssName] of TIMED_EVENTS) {
    vars[`--since-${cssName}`] = cssSeconds(since(state, type, time));
    vars[`--until-${cssName}`] = cssSeconds(until(state, type, time));
  }
  vars['--drop-intensity'] = cssNumber(lastEvent(state, 'drop')?.intensity ?? 0);
  vars['--section-time'] = cssSeconds(state.section ? time - state.sectionStart : Infinity);
  vars['--set-progress'] = cssNumber(duration > 0 ? clamp(time / duration, 0, 1) : 0);
  return vars;
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

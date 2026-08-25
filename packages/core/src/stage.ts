import type { EventOf } from './events.ts';
import { since, until, type EventState } from './timeline.ts';

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

/**
 * Stage-root custom properties: the event timeline as numbers CSS can do arithmetic with.
 * `--since-*` and `--until-*` are seconds capped at `SECONDS_CAP`; `--drop-intensity` is 0..1.
 * Double drops count as drops.
 */
export function stageVars(state: EventState, time: number): Record<string, string> {
  const drop = lastDrop(state);
  const coming = nextDrop(state);
  return {
    '--since-track': secs(since(state, 'track_start', time)),
    '--until-track': secs(until(state, 'track_start', time)),
    '--since-drop': secs(drop ? time - drop.time : Infinity),
    '--until-drop': secs(coming ? coming.time - time : Infinity),
    '--drop-intensity': num(drop?.intensity ?? 0),
    '--since-rewind': secs(since(state, 'rewind', time)),
    '--section-time': secs(state.section ? time - state.sectionStart : Infinity),
  };
}

type Drop = EventOf<'drop'> | EventOf<'double_drop'>;

const lastDrop = (state: EventState): Drop | undefined => {
  const { drop, double_drop: double } = state.last;
  return !double || (drop && drop.time >= double.time) ? drop : double;
};

const nextDrop = (state: EventState): Drop | undefined => {
  const { drop, double_drop: double } = state.next;
  return !double || (drop && drop.time <= double.time) ? drop : double;
};

const num = (v: number) => String(Math.round(v * 1000) / 1000);
const secs = (v: number) => num(Math.min(v, SECONDS_CAP));

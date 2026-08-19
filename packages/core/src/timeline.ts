import {
  SECTION_TYPES,
  sortEvents,
  type EventOf,
  type EventType,
  type SectionType,
  type SetEvent,
  type Track,
} from './events.ts';

/** Everything a component needs to know about the event timeline at one instant. */
export interface EventState {
  /** All events, sorted by time. */
  all: readonly SetEvent[];
  /** Active track, from the latest `track_start` at or before now. */
  track: Track | null;
  /** Index of the active track among `track_start` events; -1 before the first. */
  trackIndex: number;
  /** Latest event of each type at or before now. */
  last: Partial<{ [T in EventType]: EventOf<T> }>;
  /** First event of each type after now. */
  next: Partial<{ [T in EventType]: EventOf<T> }>;
  /** Current section, from the latest drop / double_drop / breakdown / buildup. */
  section: SectionType | null;
  sectionStart: number;
}

export class Timeline {
  readonly events: readonly SetEvent[];
  readonly tracks: readonly EventOf<'track_start'>[];

  constructor(events: readonly SetEvent[]) {
    this.events = sortEvents(events);
    this.tracks = this.events.filter((e) => e.type === 'track_start');
  }

  at(time: number): EventState {
    const last: EventState['last'] = {};
    const next: EventState['next'] = {};
    let trackIndex = -1;
    let section: SectionType | null = null;
    let sectionStart = 0;

    for (const e of this.events) {
      if (e.time <= time) {
        (last as Record<string, SetEvent>)[e.type] = e;
        if (e.type === 'track_start') trackIndex++;
        if (isSection(e.type)) {
          section = e.type;
          sectionStart = e.time;
        }
      } else if (!(e.type in next)) {
        (next as Record<string, SetEvent>)[e.type] = e;
      }
    }

    const start = last.track_start;
    const track = start ? trackOf(start) : null;
    return { all: this.events, track, trackIndex, last, next, section, sectionStart };
  }
}

const isSection = (type: EventType): type is SectionType =>
  (SECTION_TYPES as readonly string[]).includes(type);

const trackOf = ({ title, artist, label, deck }: EventOf<'track_start'>): Track => ({
  title,
  artist,
  ...(label !== undefined && { label }),
  ...(deck !== undefined && { deck }),
});

/** Seconds since the latest event of `type`, or Infinity when none has happened yet. */
export const since = (state: EventState, type: EventType, time: number): number => {
  const e = state.last[type];
  return e ? time - e.time : Infinity;
};

/** Seconds until the next event of `type`, or Infinity when none is coming. */
export const until = (state: EventState, type: EventType, time: number): number => {
  const e = state.next[type];
  return e ? e.time - time : Infinity;
};

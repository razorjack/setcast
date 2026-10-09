import {
  microseconds,
  type MixDocument,
  type Play,
  type Recording,
  type Contribution,
  type Annotation,
  type SectionKind,
} from './mix-schema.ts';
import { sectionTargets, validateMix } from './mix-validation.ts';

export type ContributionRun = {
  id: string;
  play: string;
  from: number;
  until: number;
  returning: boolean;
};
export type Section = { kind: SectionKind; start: number };
export type CurrentPlay = {
  play: Play;
  recording: Recording;
  contribution: Contribution;
  run: ContributionRun;
  deck?: string;
  section: Section | null;
};
export type AnnotationQuery = {
  last: Record<string, Annotation[]>;
  next: Record<string, Annotation[]>;
};
export interface MixState {
  time: number;
  currentPlays: CurrentPlay[];
  focusPlays: CurrentPlay[];
  mixSection: Section | null;
  activeAnnotations: Annotation[];
  annotations: { mix: AnnotationQuery; plays: Record<string, AnnotationQuery> };
  nextEntries: ContributionRun[];
  nextListings: MixDocument['listings'];
  listings: MixDocument['listings'];
  recordingCount: number;
  playCount: number;
  listingCount: number;
  currentPlayCount: number;
}

/** First index whose timestamp is strictly later than time. */
function upperBound<T>(entries: readonly T[], time: number, stamp: (entry: T) => number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (stamp(entries[middle]!) <= time) low = middle + 1;
    else high = middle;
  }
  return low;
}
const byAt = (entry: { at: number }) => entry.at;
const byFrom = (entry: { from: number }) => entry.from;

export class MixTimeline {
  readonly document: MixDocument;
  readonly runs: ContributionRun[];
  readonly overlaps: boolean;
  private readonly recordings: Map<string, Recording>;
  private readonly intervals: Map<string, Contribution[]>;
  private readonly playRuns: Map<string, ContributionRun[]>;
  private readonly cues = new Map<string, Map<string, Annotation[]>>();
  private readonly sections = new Map<string, Annotation[]>();
  private readonly directives: MixDocument['focus'];

  constructor(document: MixDocument) {
    validateMix(document);
    // Own the revision: later caller mutations cannot invalidate this timeline's indexes.
    this.document = structuredClone(document);
    this.recordings = new Map(
      this.document.recordings.map((recording) => [recording.id, recording]),
    );
    this.intervals = Map.groupBy(this.document.contributions, (interval) => interval.play);
    this.runs = compileRuns(this.document);
    this.playRuns = Map.groupBy(this.runs, (run) => run.play);
    this.overlaps = hasOverlap(this.runs);
    this.directives = this.document.focus.toSorted((left, right) => left.at - right.at);
    this.document.listings.sort((left, right) => left.at - right.at || left.order - right.order);
    this.document.plays.sort((left, right) => left.order - right.order);
    for (const annotation of this.document.annotations.toSorted(
      (left, right) => left.at - right.at || left.order - right.order,
    ))
      this.indexAnnotation(annotation);
  }

  at(timeSeconds: number): MixState {
    const time = microseconds(timeSeconds);
    if (time >= this.document.duration)
      throw new RangeError(
        `Timeline.at(${timeSeconds}) is outside the mix; query 0 <= time < ${this.document.duration / 1_000_000} seconds.`,
      );
    const currentPlays = this.document.plays.flatMap((play) => this.currentPlay(play, time));
    const local = Object.fromEntries(
      currentPlays.map((current) => [
        current.play.id,
        this.queryAnnotations(current.play.id, time, current.run),
      ]),
    );
    return {
      time,
      currentPlays,
      focusPlays: this.focusAt(currentPlays, time),
      mixSection: this.sectionAt('$mix', time),
      activeAnnotations: this.document.annotations.filter(
        (cue) => 'until' in cue && cue.until !== undefined && cue.at <= time && time < cue.until,
      ),
      annotations: { mix: this.queryAnnotations('$mix', time), plays: local },
      nextEntries: nextGroup(this.runs, time, byFrom),
      nextListings: nextGroup(this.document.listings, time, byAt),
      listings: this.document.listings,
      recordingCount: this.document.recordings.length,
      playCount: this.document.plays.length,
      listingCount: this.document.listings.length,
      currentPlayCount: currentPlays.length,
    };
  }

  private currentPlay(play: Play, time: number): CurrentPlay[] {
    const intervals = this.intervals.get(play.id)!;
    const contribution = intervals[upperBound(intervals, time, byFrom) - 1];
    if (!contribution || time >= contribution.until) return [];
    const runs = this.playRuns.get(play.id)!;
    const run = runs[upperBound(runs, time, byFrom) - 1]!;
    return [
      {
        play,
        recording: this.recordings.get(play.recording)!,
        contribution,
        run,
        deck: contribution.deck,
        section: this.sectionAt(play.id, time, run.from),
      },
    ];
  }

  private focusAt(current: CurrentPlay[], time: number): CurrentPlay[] {
    const directive = this.directives[upperBound(this.directives, time, byAt) - 1];
    if (directive) {
      const pinned = directive.plays.flatMap((id) =>
        current.filter(
          (entry) =>
            entry.play.id === id &&
            entry.run.from <= directive.at &&
            directive.at < entry.run.until,
        ),
      );
      if (pinned.length) return pinned;
    }
    const eligible = current.filter((entry) => !entry.contribution.tail);
    const candidates = eligible.length ? eligible : current;
    return candidates
      .toSorted(
        (left, right) => right.run.from - left.run.from || left.play.order - right.play.order,
      )
      .slice(0, 1);
  }

  private indexAnnotation(annotation: Annotation): void {
    const targets = annotation.scope === 'mix' ? ['$mix'] : annotation.scope.plays;
    if (annotation.kind === 'drop' && annotation.scope === 'mix')
      targets.push(...(annotation.participants ?? []));
    for (const target of targets) {
      const kinds = this.cues.get(target) ?? new Map<string, Annotation[]>();
      const cues = kinds.get(annotation.kind) ?? [];
      cues.push(annotation);
      kinds.set(annotation.kind, cues);
      this.cues.set(target, kinds);
    }
    for (const target of sectionTargets(annotation)) {
      const sections = this.sections.get(target) ?? [];
      sections.push(annotation);
      this.sections.set(target, sections);
    }
  }

  private sectionAt(target: string, time: number, from = 0): Section | null {
    const sections = this.sections.get(target) ?? [];
    const cue = sections[upperBound(sections, time, byAt) - 1];
    if (!cue || cue.at < from || cue.kind === 'section_end') return null;
    return { kind: cue.kind as SectionKind, start: cue.at };
  }

  private queryAnnotations(target: string, time: number, run?: ContributionRun): AnnotationQuery {
    const query: AnnotationQuery = { last: {}, next: {} };
    for (const [kind, cues] of this.cues.get(target) ?? []) {
      const next = upperBound(cues, time, byAt);
      const lastTime = cues[next - 1]?.at;
      const nextTime = cues[next]?.at;
      if (lastTime !== undefined)
        query.last[kind] = cues
          .slice(upperBound(cues, lastTime - 1, byAt), next)
          .filter((cue) => !run || cue.at >= run.from);
      if (nextTime !== undefined)
        query.next[kind] = cues
          .slice(next, upperBound(cues, nextTime, byAt))
          .filter((cue) => !run || cue.at < run.until);
    }
    return query;
  }
}

function compileRuns(document: MixDocument): ContributionRun[] {
  const runs: ContributionRun[] = [];
  for (const [play, intervals] of Map.groupBy(
    document.contributions,
    (interval) => interval.play,
  )) {
    let previous: ContributionRun | undefined;
    let count = 0;
    for (const interval of intervals) {
      if (previous?.until === interval.from) previous.until = interval.until;
      else {
        previous = {
          id: `$run:${play}:${count}`,
          play,
          from: interval.from,
          until: interval.until,
          returning: count > 0,
        };
        runs.push(previous);
        count++;
      }
    }
  }
  const order = new Map(document.plays.map((play) => [play.id, play.order]));
  return runs.sort(
    (left, right) => left.from - right.from || order.get(left.play)! - order.get(right.play)!,
  );
}
function hasOverlap(runs: ContributionRun[]): boolean {
  let end = 0;
  for (const run of runs) {
    if (run.from < end) return true;
    end = Math.max(end, run.until);
  }
  return false;
}
function nextGroup<T>(entries: T[], time: number, stamp: (entry: T) => number): T[] {
  const index = upperBound(entries, time, stamp);
  const first = entries[index];
  return first ? entries.slice(index, upperBound(entries, stamp(first), stamp)) : [];
}
export function lastAnnotations(state: MixState, kind: string, scope = 'mix'): Annotation[] {
  return (
    (scope === 'mix' ? state.annotations.mix : state.annotations.plays[scope])?.last[kind] ?? []
  );
}
export function nextAnnotations(state: MixState, kind: string, scope = 'mix'): Annotation[] {
  return (
    (scope === 'mix' ? state.annotations.mix : state.annotations.plays[scope])?.next[kind] ?? []
  );
}
/** Single-cue helpers select the first annotation in stable input order within a tied group. */
export const sinceAnnotation = (state: MixState, kind: string, scope = 'mix'): number => {
  const cue = lastAnnotations(state, kind, scope)[0];
  return cue ? (state.time - cue.at) / 1_000_000 : Infinity;
};
export const untilAnnotation = (state: MixState, kind: string, scope = 'mix'): number => {
  const cue = nextAnnotations(state, kind, scope)[0];
  return cue ? (cue.at - state.time) / 1_000_000 : Infinity;
};

import { z } from 'zod';
import { clamp, ease, lerp } from './motion.ts';
import type { Listing, MixDocument, Recording } from './mix-schema.ts';
import type { CurrentPlay, MixState } from './timeline.ts';

/** How many listings the tracklist shows before and after the current listing group. */
export type TracklistCounts = { before: number; after: number };

export const TRACKLIST_DEFAULTS: TracklistCounts = { before: 2, after: 2 };

/** Seconds the list takes to move on to a new listing group. */
export const TRACKLIST_GLIDE_SECONDS = 0.8;

const tracklistError =
  'tracklist must be true, false or a mapping such as { before: 2, after: 2 }.';
const countError = (key: string) => `${key} must be a whole number of listings from 0 to 99.`;
const listingCount = (key: string) =>
  z
    .number({ error: countError(key) })
    .int({ error: countError(key) })
    .min(0, { error: countError(key) })
    .max(99, { error: countError(key) })
    .optional();

export const TracklistCountsSchema = z.strictObject(
  { before: listingCount('before'), after: listingCount('after') },
  {
    error: (issue) =>
      issue.code === 'unrecognized_keys'
        ? `tracklist takes before and after, not ${issue.keys.join(', ')}.`
        : tracklistError,
  },
);

const isMapping = (input: unknown) =>
  typeof input === 'object' && input !== null && !Array.isArray(input);

/** A union reports its own message; a mapping that fails reports what is wrong inside it. */
export const TracklistSchema = z.union([z.boolean(), TracklistCountsSchema], {
  error: (issue) => {
    if (issue.code !== 'invalid_union' || !isMapping(issue.input)) return tracklistError;
    return issue.errors[1]?.[0]?.message ?? tracklistError;
  },
});

export type TracklistInput = z.input<typeof TracklistSchema>;
export type TracklistCountsInput = z.input<typeof TracklistCountsSchema>;

export type TracklistRowState = 'played' | 'current' | 'upcoming';

export interface TracklistRow {
  listing: Listing;
  /** The listing's position in the tracklist, from 0. */
  index: number;
  recording: Recording;
  /** `current` while the play contributes; otherwise its listing time decides. */
  state: TracklistRowState;
  focused: boolean;
  returning: boolean;
  /** The listing time is still to come; a current row that is ahead plays early, like a tease. */
  ahead: boolean;
  /** The deck of the current contribution, when it has one. */
  deck?: string;
  /** The play's current run and contribution while it contributes. */
  current?: CurrentPlay;
  /** Rows from the first row of the current listing group, fractional while the list moves on. */
  offset: number;
  /** 0..1: how far inside the window the row is. Rows enter and leave the list through it. */
  presence: number;
  /** 0..1 through the row's listing span, from its time to the next listing group or mix end. */
  progress: number;
}

export interface TracklistView {
  rows: TracklistRow[];
  /** Seconds since the current listing group, Infinity before the first. */
  sinceListing: number;
  /** Seconds until the next listing group, Infinity after the last. */
  untilListing: number;
}

type ListingGroup = { start: number; size: number; at: number };

/**
 * The listings around the current one. Position follows listings: the window is anchored on the
 * latest listing group at or before now and glides to the next one when it starts. State follows
 * contributions: a row is current while its play contributes, wherever the row sits.
 */
export function tracklistView(
  document: MixDocument,
  state: MixState,
  counts: TracklistCounts,
): TracklistView {
  const listings = state.listings;
  const groups = listingGroups(listings);
  const currentIndex = groups.findLastIndex((group) => group.at <= state.time);
  // before the first listing the window sits as if on a row above the list
  const beforeFirst: ListingGroup = { start: -1, size: 1, at: -Infinity };
  const current = groups[currentIndex] ?? beforeFirst;
  const previous = groups[currentIndex - 1] ?? beforeFirst;
  const next = groups[currentIndex + 1];

  const sinceListing = (state.time - current.at) / 1_000_000;
  const glide = ease.inOut(clamp(sinceListing / TRACKLIST_GLIDE_SECONDS, 0, 1));
  const span = (group: ListingGroup) => ({
    anchor: group.start,
    low: group.start - counts.before,
    high: group.start + group.size - 1 + counts.after,
  });
  const from = span(previous);
  const to = span(current);
  const anchor = lerp(from.anchor, to.anchor, glide);
  const low = lerp(from.low, to.low, glide);
  const high = lerp(from.high, to.high, glide);

  const describe = rowDescriber(document, state, groups);
  const rows: TracklistRow[] = [];
  const first = Math.max(0, Math.floor(low));
  const last = Math.min(listings.length - 1, Math.ceil(high));
  for (let index = first; index <= last; index++) {
    const presence = clamp(1 - Math.max(low - index, index - high, 0), 0, 1);
    if (presence > 0) rows.push({ ...describe(index), offset: index - anchor, presence });
  }

  return {
    rows,
    sinceListing,
    untilListing: next ? (next.at - state.time) / 1_000_000 : Infinity,
  };
}

/** Consecutive listings at one time form a group; listings arrive sorted by time. */
function listingGroups(listings: readonly Listing[]): ListingGroup[] {
  const groups: ListingGroup[] = [];
  for (const [index, listing] of listings.entries()) {
    const group = groups.at(-1);
    if (group?.at === listing.at) group.size++;
    else groups.push({ start: index, size: 1, at: listing.at });
  }
  return groups;
}

function rowDescriber(document: MixDocument, state: MixState, groups: ListingGroup[]) {
  const plays = new Map(document.plays.map((play) => [play.id, play]));
  const recordings = new Map(document.recordings.map((recording) => [recording.id, recording]));
  const current = new Map(state.currentPlays.map((entry) => [entry.play.id, entry]));
  const focused = new Set(state.focusPlays.map((entry) => entry.play.id));
  const firstHeard = new Map<string, number>();
  for (const contribution of document.contributions) {
    const heard = firstHeard.get(contribution.play) ?? Infinity;
    firstHeard.set(contribution.play, Math.min(heard, contribution.from));
  }

  const stateOf = (listing: Listing): TracklistRowState => {
    if (current.has(listing.play)) return 'current';
    const heard = (firstHeard.get(listing.play) ?? Infinity) <= state.time;
    return listing.at <= state.time && heard ? 'played' : 'upcoming';
  };
  const spanEnd = (listing: Listing) =>
    groups.find((group) => group.at > listing.at)?.at ?? document.duration;

  return (index: number) => {
    const listing = state.listings[index]!;
    const play = plays.get(listing.play)!;
    const entry = current.get(listing.play);
    const length = spanEnd(listing) - listing.at;
    return {
      listing,
      index,
      recording: recordings.get(play.recording)!,
      state: stateOf(listing),
      focused: focused.has(listing.play),
      returning: entry?.run.returning ?? false,
      ahead: listing.at > state.time,
      deck: entry?.deck,
      current: entry,
      progress: clamp((state.time - listing.at) / length, 0, 1),
    };
  };
}

/** The project's `tracklist:` over the theme's default; null when neither shows one. */
export function resolveTracklist(
  written: TracklistInput | undefined,
  themeDefault: TracklistCountsInput | undefined,
): TracklistCounts | null {
  if (written === false) return null;
  if (written === undefined && themeDefault === undefined) return null;
  const own = typeof written === 'object' ? written : {};
  const theme = themeDefault ?? {};
  return {
    before: own.before ?? theme.before ?? TRACKLIST_DEFAULTS.before,
    after: own.after ?? theme.after ?? TRACKLIST_DEFAULTS.after,
  };
}

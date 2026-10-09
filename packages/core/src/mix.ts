import { ConfigError, zodIssues } from './errors.ts';
import {
  microseconds,
  MixInputSchema,
  MixDocumentSchema,
  type MixInput,
  type MixDocument,
  type Origin,
  type Contribution,
  type Annotation,
} from './mix-schema.ts';
import { validateMix } from './mix-validation.ts';

export function normalizeMix(input: unknown, durationSeconds: number): MixDocument {
  const parsed = MixInputSchema.safeParse(input);
  if (!parsed.success) throw new ConfigError('setcast.yaml', zodIssues(parsed.error));
  return compileMix(parsed.data, durationSeconds);
}

/** Accepts already parsed authoring times in microseconds. */
export function compileMix(input: MixInput, durationSeconds: number): MixDocument {
  const duration = microseconds(durationSeconds);
  const document: MixDocument = {
    version: 1,
    duration,
    recordings: Object.entries(input.recordings).map(([id, recording]) => ({ id, ...recording })),
    plays: [],
    contributions: [],
    listings: [],
    annotations: input.annotations.map((annotation, order) =>
      normalizeAnnotation(annotation, order, duration),
    ),
    focus: input.focus.map((focus, order) => ({ ...focus, id: focus.id ?? `$focus:${order}` })),
    chapters: input.chapters ?? [],
    sources: input.sources,
    extensions: input.extensions,
  };
  input.plays.forEach((row, order) => appendPlay(document, input, row, order));
  if (input.chapters === undefined) document.chapters = generatedChapters(document);
  try {
    validateMix(document);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    throw new ConfigError(
      'setcast.yaml',
      error.issues.map((issue) => ({ ...issue, path: authoringPath(document, issue.path) })),
    );
  }
  document.listings.sort((left, right) => left.at - right.at || left.order - right.order);
  document.annotations.sort((left, right) => left.at - right.at || left.order - right.order);
  document.focus.sort((left, right) => left.at - right.at);
  document.chapters.sort((left, right) => left.at - right.at);
  return document;
}

function authoringPath(document: MixDocument, path: string): string {
  const match = /^(recordings|contributions|listings)\[(\d+)\](.*)$/.exec(path);
  if (!match) return path;
  const [, kind, index, field] = match;
  const position = Number(index);
  if (kind === 'listings') return `plays[${document.listings[position]!.order}].at`;
  if (kind === 'contributions') {
    const interval = document.contributions[position]!;
    const base = interval.origins.from.path.replace(/\.(from|at)$/, '');
    return `${base}${field}`;
  }
  const recording = document.recordings[position]!;
  const inline = document.plays.find((play) => play.recording === recording.id);
  return recording.id.startsWith('$')
    ? `plays[${inline!.order}]${field}`
    : `recordings.${recording.id}${field}`;
}

function appendPlay(
  document: MixDocument,
  input: MixInput,
  row: MixInput['plays'][number],
  order: number,
): void {
  const id = row.id ?? `$play:${order}`;
  const recording = row.recording ?? `$recording:${order}`;
  if (!row.recording) {
    document.recordings.push({
      id: recording,
      title: row.title!,
      artist: row.artist,
      label: row.label,
      version: row.version,
      evidence: row.evidence,
      extensions: row.extensions,
    });
  }
  document.plays.push({
    id,
    recording,
    order,
    background: row.background,
    extensions: row.extensions,
  });
  if (row.at !== undefined)
    document.listings.push({ id: `$listing:${order}`, at: row.at, play: id, order });
  document.contributions.push(...playContributions(document, input, row, order));
}

function playContributions(
  document: MixDocument,
  input: MixInput,
  row: MixInput['plays'][number],
  order: number,
): Contribution[] {
  const id = row.id ?? `$play:${order}`;
  if (row.contributions)
    return row.contributions.map((interval, index) => {
      const path = `plays[${order}].contributions[${index}]`;
      return {
        ...interval,
        id: interval.id ?? `$contribution:${order}:${index}`,
        play: id,
        until: interval.until === 'end' ? document.duration : interval.until,
        origins: {
          from: { kind: 'authored' as const, path: `${path}.from` },
          until: endOrigin(interval.until, `${path}.until`),
        },
      };
    });
  const next = input.plays
    .filter((play) => play.at !== undefined && play.at > row.at!)
    .sort((left, right) => left.at! - right.at!)[0];
  const until = row.until ?? next?.at ?? document.duration;
  let origin: Origin = endOrigin(row.until, `plays[${order}].until`);
  if (row.until === undefined)
    origin = next
      ? { kind: 'next_listing', path: `plays[${input.plays.indexOf(next)}].at` }
      : { kind: 'mix_end', path: 'audio' };
  return [
    {
      id: `$contribution:${order}:0`,
      play: id,
      from: row.at!,
      until: until === 'end' ? document.duration : until,
      origins: { from: { kind: 'listing', path: `plays[${order}].at` }, until: origin },
    },
  ];
}

const endOrigin = (until: number | 'end' | undefined, path: string): Origin => ({
  kind: until === 'end' ? 'mix_end' : 'authored',
  path,
});

function generatedChapters(document: MixDocument): MixDocument['chapters'] {
  const groups = Map.groupBy(document.listings, (listing) => listing.at);
  const recordings = new Map(document.recordings.map((recording) => [recording.id, recording]));
  const plays = new Map(document.plays.map((play) => [play.id, play]));
  return [...groups].map(([at, listings]) => ({
    at,
    title: listings
      .map((listing) => {
        const recording = recordings.get(plays.get(listing.play)!.recording);
        if (!recording) return listing.play;
        return recording.artist ? `${recording.artist} - ${recording.title}` : recording.title;
      })
      .join(' / '),
  }));
}

export function readMixDocument(input: unknown): MixDocument {
  const parsed = MixDocumentSchema.safeParse(input);
  if (!parsed.success) throw new ConfigError('mix document', zodIssues(parsed.error));
  const document = parsed.data as MixDocument;
  validateMix(document);
  return document;
}

export function mixWarnings(document: MixDocument): string[] {
  return document.listings
    .filter(
      (listing) =>
        !document.contributions.some(
          (interval) => interval.play === listing.play && contains(interval, listing.at),
        ),
    )
    .map(
      (listing) =>
        `plays[${listing.order}].at (${listing.at / 1_000_000} s) lies outside its contributions; the editorial listing is preserved.`,
    );
}

export const contains = (interval: Pick<Contribution, 'from' | 'until'>, time: number): boolean =>
  interval.from <= time && time < interval.until;

function normalizeAnnotation(
  annotation: MixInput['annotations'][number],
  order: number,
  duration: number,
): Annotation {
  const normalized = { ...annotation, id: annotation.id ?? `$annotation:${order}`, order };
  if ('until' in normalized && normalized.until === 'end')
    return { ...normalized, until: duration };
  return normalized as Annotation;
}

import { ConfigError } from './errors.ts';
import { type Annotation, type MixDocument } from './mix-schema.ts';

function fail(path: string, value: unknown, rule: string): never {
  throw new ConfigError('mix timeline', [{ path, message: `${JSON.stringify(value)}: ${rule}` }]);
}

/** The index key of mix-scoped annotations; play IDs key the play-scoped ones. */
export const MIX_TARGET = '$mix';

export function sectionTargets(annotation: Annotation): string[] {
  if (!['drop', 'breakdown', 'buildup', 'section_end'].includes(annotation.kind)) return [];
  if (annotation.scope !== 'mix') return annotation.scope.plays;
  if (annotation.kind === 'drop') return [MIX_TARGET, ...(annotation.participants ?? [])];
  return [MIX_TARGET];
}

export function validateMix(document: MixDocument): void {
  if (!Number.isSafeInteger(document.duration) || document.duration <= 0)
    fail('duration', document.duration, 'use a positive mix duration in integer microseconds.');
  for (const kind of [
    'recordings',
    'plays',
    'contributions',
    'listings',
    'annotations',
    'focus',
  ] as const) {
    unique(
      document[kind].map((entity) => entity.id),
      kind,
      'IDs',
    );
  }
  unique(
    document.plays.map((play) => play.order),
    'plays',
    'input orders',
  );
  const playIds = new Set(document.plays.map((play) => play.id));
  const recordingIds = new Set(document.recordings.map((recording) => recording.id));
  document.plays.forEach((play, index) =>
    reference(recordingIds, play.recording, `plays[${index}].recording`),
  );
  validateContributions(document, playIds);
  document.listings.forEach((listing, index) => {
    moment(document, listing.at, `listings[${index}].at`);
    reference(playIds, listing.play, `listings[${index}].play`);
  });
  unique(
    document.listings.map((listing) => listing.play),
    'listings',
    'plays (one listing per play)',
  );
  document.chapters.forEach((chapter, index) =>
    moment(document, chapter.at, `chapters[${index}].at`),
  );
  unique(
    document.chapters.map((chapter) => chapter.at),
    'chapters',
    'times',
  );
  validateAnnotations(document, playIds);
  validateFocus(document, playIds);
  validateEvidence(document);
}

function validateEvidence(document: MixDocument): void {
  for (const kind of ['recordings', 'contributions', 'annotations'] as const) {
    document[kind].forEach((entity, index) =>
      entity.evidence?.forEach((source) =>
        reference(new Set(Object.keys(document.sources)), source, `${kind}[${index}].evidence`),
      ),
    );
  }
}

function unique(values: readonly (string | number)[], path: string, label: string): void {
  const seen = new Set<string | number>();
  values.forEach((value, index) => {
    if (seen.has(value))
      fail(
        `${path}[${index}]`,
        value,
        `duplicate ${label}; choose a unique value or combine entries.`,
      );
    seen.add(value);
  });
}
function reference(ids: Set<string>, id: string, path: string): void {
  if (!ids.has(id)) fail(path, id, 'reference does not exist; define it or correct the ID.');
}
function moment(document: MixDocument, at: number, path: string): void {
  if (!Number.isSafeInteger(at) || at < 0 || at >= document.duration)
    fail(path, at, `use a time in [0, ${document.duration}) microseconds, before mix end.`);
}
function span(document: MixDocument, from: number, until: number, path: string): void {
  if (
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(until) ||
    from < 0 ||
    until <= from ||
    until > document.duration
  )
    fail(
      path,
      { from, until },
      `use 0 <= from < until <= ${document.duration} microseconds; intervals must have positive duration.`,
    );
}
function validateContributions(document: MixDocument, playIds: Set<string>): void {
  const ends = new Map<string, number>();
  document.contributions.forEach((interval, index) => {
    const path = `contributions[${index}]`;
    reference(playIds, interval.play, `${path}.play`);
    span(document, interval.from, interval.until, path);
    if (interval.from < (ends.get(interval.play) ?? 0))
      fail(
        path,
        interval.from,
        'intervals within a play must be ordered and nonoverlapping; reorder them or use separate plays for copies.',
      );
    ends.set(interval.play, interval.until);
  });
  for (const play of document.plays)
    if (!ends.has(play.id))
      fail(
        'contributions',
        play.id,
        'each play needs at least one interval; add its contribution.',
      );
}
function participating(document: MixDocument, play: string, at: number, before = false): boolean {
  return document.contributions.some(
    (interval) =>
      interval.play === play &&
      (before
        ? interval.from < at && at <= interval.until
        : interval.from <= at && at < interval.until),
  );
}
function validateAnnotations(document: MixDocument, playIds: Set<string>): void {
  const writes = new Set<string>();
  document.annotations.forEach((annotation, index) => {
    const path = `annotations[${index}]`;
    moment(document, annotation.at, `${path}.at`);
    if ('until' in annotation && annotation.until !== undefined)
      span(document, annotation.at, annotation.until, path);
    if (!Number.isSafeInteger(annotation.order))
      fail(`${path}.order`, annotation.order, 'supply the stable input order.');
    const targets =
      annotation.scope === 'mix' ? (annotation.participants ?? []) : annotation.scope.plays;
    targets.forEach((play) => reference(playIds, play, path));
    const sections = sectionTargets(annotation);
    for (const play of sections.filter((target) => target !== '$mix')) {
      if (!participating(document, play, annotation.at))
        fail(
          path,
          play,
          'a section target must contribute after boundaries at this time; move the cue or correct contributions.',
        );
    }
    if (annotation.kind === 'rewind')
      for (const play of targets) {
        if (
          !participating(document, play, annotation.at) &&
          !participating(document, play, annotation.at, true)
        )
          fail(
            path,
            play,
            'a rewind target must contribute immediately before or after the cue; move the cue or correct contributions.',
          );
      }
    for (const target of sections) {
      const key = `${annotation.at}:${target}`;
      if (writes.has(key))
        fail(
          path,
          { at: annotation.at, target },
          'two section writes at the same time conflict; combine or remove the duplicate annotation.',
        );
      writes.add(key);
    }
  });
}
function validateFocus(document: MixDocument, playIds: Set<string>): void {
  unique(
    document.focus.map((directive) => directive.at),
    'focus',
    'times',
  );
  document.focus.forEach((directive, index) => {
    const path = `focus[${index}]`;
    moment(document, directive.at, `${path}.at`);
    for (const play of directive.plays) {
      reference(playIds, play, `${path}.plays`);
      if (!participating(document, play, directive.at))
        fail(
          path,
          play,
          'a pinned play must contribute after boundaries at this time; move the directive or select a current play.',
        );
    }
  });
}

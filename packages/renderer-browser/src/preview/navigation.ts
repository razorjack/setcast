import { framesWithinMix, microseconds, toSeconds, type ResolvedProject } from '@setcast/core';

export type MarkKind = 'listing' | 'annotation' | 'scene';
export interface PreviewMark {
  frame: number;
  kind: MarkKind;
  label: string;
}

export function previewMarks(project: ResolvedProject): PreviewMark[] {
  const recordings = new Map(project.mix.recordings.map((recording) => [recording.id, recording]));
  const plays = new Map(project.mix.plays.map((play) => [play.id, play]));
  const frameAt = (seconds: number) => framesWithinMix(microseconds(seconds), project.fps);
  const listings: PreviewMark[] = project.mix.listings.map((listing) => {
    const recording = recordings.get(plays.get(listing.play)!.recording)!;
    const label = [recording.artist, recording.title].filter(Boolean).join(' · ');
    return { frame: frameAt(toSeconds(listing.at)), kind: 'listing', label };
  });
  const annotations: PreviewMark[] = project.mix.annotations.map((annotation) => {
    const scope = annotation.scope === 'mix' ? 'mix' : annotation.scope.plays.join(', ');
    const label = annotation.kind === 'note' ? annotation.text : annotation.kind;
    return {
      frame: frameAt(toSeconds(annotation.at)),
      kind: 'annotation',
      label: `${label} (${scope})`,
    };
  });
  const scenes: PreviewMark[] = (project.scenes ?? []).map(({ at, scene }) => ({
    frame: frameAt(at),
    kind: 'scene',
    label: scene.title || scene.theme,
  }));
  const count = framesWithinMix(project.mix.duration, project.fps);
  return [...listings, ...annotations, ...scenes]
    .filter((mark) => mark.frame < count)
    .sort((a, b) => a.frame - b.frame);
}

export function adjacentMark(marks: PreviewMark[], frame: number, direction: -1 | 1) {
  return direction === 1
    ? marks.find((mark) => mark.frame > frame)?.frame
    : marks.findLast((mark) => mark.frame < frame)?.frame;
}

export function adjacentBeat(
  project: ResolvedProject,
  frame: number,
  direction: -1 | 1,
  beats: 1 | 4,
): number | undefined {
  const spans = [{ at: 0, scene: project }, ...(project.scenes ?? [])];
  const duration = toSeconds(project.mix.duration);
  let closest: number | undefined;
  for (const [index, span] of spans.entries()) {
    const until = spans[index + 1]?.at ?? duration;
    if (!span.scene.bpm || span.at >= until) continue;
    const at = adjacentGridTime({
      from: span.at,
      until,
      boundary: direction === 1 ? frame / project.fps : (frame - 1) / project.fps,
      direction,
      period: (60 * beats) / span.scene.bpm,
      offset: span.scene.beatOffset,
    });
    if (at === undefined) continue;
    const target = Math.max(0, Math.ceil(at * project.fps - 1e-9));
    if (target >= framesWithinMix(project.mix.duration, project.fps)) continue;
    if (direction * (target - frame) <= 0) continue;
    if (closest === undefined || direction * (target - closest) < 0) closest = target;
  }
  return closest;
}

function adjacentGridTime({
  from,
  until,
  boundary,
  direction,
  period,
  offset,
}: {
  from: number;
  until: number;
  boundary: number;
  direction: -1 | 1;
  period: number;
  offset: number;
}) {
  const limit = direction === 1 ? Math.max(boundary, from) : Math.min(boundary, until);
  let beat =
    direction === 1 ? Math.ceil((limit - offset) / period) : Math.floor((limit - offset) / period);
  let at = offset + beat * period;
  if (direction === 1 && at <= boundary + 1e-9) at = offset + ++beat * period;
  if (direction === -1 && at >= until) at = offset + --beat * period;
  if (at < from - 1e-9 || at >= until || at < 0) return undefined;
  return at;
}

export interface PreviewSelection {
  first: number;
  last: number;
  fps: number;
}
export function fitSelection(selection: PreviewSelection | null, count: number, fps: number) {
  if (!selection) return { first: 0, last: count - 1, fps };
  const first = Math.max(
    0,
    Math.min(count - 1, Math.round((selection.first / selection.fps) * fps)),
  );
  const last = Math.max(
    first,
    Math.min(count - 1, Math.round(((selection.last + 1) / selection.fps) * fps) - 1),
  );
  return { first, last, fps };
}

import { useMemo, useState, type PointerEvent } from 'react';
import { toSeconds, clamp, formatTime, type MixDocument } from '@setcast/core';

export interface Segment {
  start: number;
  end: number;
  title: string;
}

/** The set as chapters in seconds, covering it from start to end. */
export function segmentsOf(mix: MixDocument): Segment[] {
  const duration = toSeconds(mix.duration);
  const starts = mix.chapters.map((chapter) => ({
    start: toSeconds(chapter.at),
    title: chapter.title,
  }));
  if (starts[0]?.start !== 0) starts.unshift({ start: 0, title: '' });
  return starts.map((chapter, index) => ({
    ...chapter,
    end: starts[index + 1]?.start ?? duration,
  }));
}

export const segmentAt = (segments: Segment[], seconds: number) =>
  segments.findLast((segment) => segment.start <= seconds);

const MARKED = new Set(['drop', 'breakdown', 'buildup']);

interface Marker {
  kind: string;
  at: number;
}

/** Drops, breakdowns and buildups of the whole mix, in seconds. */
const markersOf = (mix: MixDocument): Marker[] =>
  mix.annotations
    .filter((annotation) => annotation.scope === 'mix' && MARKED.has(annotation.kind))
    .map((annotation) => ({ kind: annotation.kind, at: toSeconds(annotation.at) }));

/**
 * A native range input does the seeking, so keyboard and assistive technology work as usual; the
 * track under it draws the chapters, the played part and the mix's sections.
 */
export function Scrubber({
  mix,
  segments,
  time,
  seek,
}: {
  mix: MixDocument;
  segments: Segment[];
  time: number;
  seek: (seconds: number) => void;
}) {
  const duration = toSeconds(mix.duration);
  const [hover, setHover] = useState<number | null>(null);
  const markers = useMemo(() => markersOf(mix), [mix]);
  const pointer = (event: PointerEvent<HTMLInputElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setHover(clamp((event.clientX - box.left) / box.width, 0, 1) * duration);
  };

  return (
    <div className="sc-scrubber" data-hover={hover !== null}>
      <Track segments={segments} markers={markers} time={time} duration={duration} />
      {hover !== null && <Preview at={hover} duration={duration} segments={segments} />}
      <input
        className="sc-scrubber-input"
        aria-label="Seek"
        aria-valuetext={formatTime(time)}
        type="range"
        min="0"
        max={duration}
        step="any"
        value={time}
        onChange={(event) => seek(event.currentTarget.valueAsNumber)}
        onPointerMove={pointer}
        onPointerLeave={() => setHover(null)}
      />
    </div>
  );
}

function Track({
  segments,
  markers,
  time,
  duration,
}: {
  segments: Segment[];
  markers: Marker[];
  time: number;
  duration: number;
}) {
  return (
    <div className="sc-scrubber-track" aria-hidden="true">
      {segments.map((segment) => (
        <div
          key={segment.start}
          className="sc-scrubber-segment"
          data-current={segment.start <= time && time < segment.end}
          style={{
            '--from': segment.start / duration,
            '--span': (segment.end - segment.start) / duration,
            '--played': clamp((time - segment.start) / (segment.end - segment.start), 0, 1),
          }}
        />
      ))}
      {markers.map((marker) => (
        <span
          key={`${marker.kind}-${marker.at}`}
          className="sc-scrubber-marker"
          data-kind={marker.kind}
          style={{ '--at': marker.at / duration }}
        />
      ))}
      <span className="sc-scrubber-head" style={{ '--at': time / duration }} />
    </div>
  );
}

function Preview({
  at,
  duration,
  segments,
}: {
  at: number;
  duration: number;
  segments: Segment[];
}) {
  const title = segmentAt(segments, at)?.title;
  return (
    <div className="sc-scrubber-preview" style={{ '--at': at / duration }} aria-hidden="true">
      <span className="sc-scrubber-preview-time">{formatTime(at)}</span>
      {title && <span className="sc-scrubber-preview-title">{title}</span>}
    </div>
  );
}

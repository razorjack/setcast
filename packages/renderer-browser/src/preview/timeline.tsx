import { useMemo, useState, type RefObject } from 'react';
import { framesWithinMix, type ResolvedProject } from '@setcast/core';
import {
  adjacentBeat,
  adjacentMark,
  fitSelection,
  previewMarks,
  type MarkKind,
  type PreviewSelection,
} from './navigation.ts';

type NavigationProps = { project: ResolvedProject; frame: number; seek: (frame: number) => void };
export function MusicalNavigation({ project, frame, seek }: NavigationProps) {
  const marks = useMemo(() => previewMarks(project), [project]);
  const [kind, setKind] = useState<MarkKind>('listing');
  const filtered = marks.filter((mark) => mark.kind === kind);
  const previous = adjacentMark(filtered, frame, -1);
  const next = adjacentMark(filtered, frame, 1);
  return (
    <section className="sp-navigation">
      <h2>Musical navigation</h2>
      <label>
        Jump by{' '}
        <select
          aria-label="Navigation kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as MarkKind)}
        >
          <option value="listing">Listings</option>
          <option value="annotation">Annotations</option>
          <option value="scene">Scenes</option>
        </select>
      </label>
      <div className="sp-navigation-row">
        <button disabled={previous === undefined} onClick={() => seek(previous!)}>
          Previous mark
        </button>
        <button disabled={next === undefined} onClick={() => seek(next!)}>
          Next mark
        </button>
      </div>
      <select
        aria-label="Timeline mark"
        value=""
        disabled={!filtered.length}
        onChange={(event) => seek(Number(event.target.value))}
      >
        <option value="">{filtered.length ? 'Choose a moment…' : 'No marks of this kind'}</option>
        {filtered.map((mark, index) => (
          <option key={index} value={mark.frame}>
            {(mark.frame / project.fps).toFixed(3)} s · {mark.label}
          </option>
        ))}
      </select>
      <BeatNavigation project={project} frame={frame} seek={seek} />
    </section>
  );
}
function BeatNavigation({ project, frame, seek }: NavigationProps) {
  return (
    <div className="sp-navigation-row">
      {([1, 4] as const).flatMap((beats) =>
        ([-1, 1] as const).map((direction) => {
          const target = adjacentBeat(project, frame, direction, beats);
          const label = `${direction === -1 ? 'Previous' : 'Next'} ${beats === 1 ? 'beat' : 'bar'}`;
          return (
            <button key={label} disabled={target === undefined} onClick={() => seek(target!)}>
              {label}
            </button>
          );
        }),
      )}
    </div>
  );
}

export function usePreviewSelection(
  project: ResolvedProject,
  stored: RefObject<PreviewSelection | null>,
) {
  const count = framesWithinMix(project.mix.duration, project.fps);
  const [range, setRange] = useState(() => fitSelection(stored.current, count, project.fps));
  const update = (next: PreviewSelection) => {
    stored.current = next;
    setRange(next);
  };
  return {
    ...range,
    count,
    setFirst: (first: number) => update({ ...range, first, last: Math.max(first, range.last) }),
    setLast: (last: number) => update({ ...range, first: Math.min(last, range.first), last }),
    reset: () => update({ first: 0, last: count - 1, fps: project.fps }),
  };
}
export type RangeSelection = ReturnType<typeof usePreviewSelection>;
export function PreviewRange({
  range,
  frame,
  seek,
}: {
  range: RangeSelection;
  frame: number;
  seek: (frame: number) => void;
}) {
  return (
    <section className="sp-range">
      <h2>Selected range</h2>
      <RangeEndpoint
        label="In frame"
        value={range.first}
        count={range.count}
        update={range.setFirst}
      />
      <RangeEndpoint
        label="Out frame"
        value={range.last}
        count={range.count}
        update={range.setLast}
      />
      <div className="sp-navigation-row">
        <button onClick={() => range.setFirst(frame)}>Set in here</button>
        <button onClick={() => range.setLast(frame)}>Set out here</button>
        <button onClick={() => seek(range.first)}>Go to in</button>
        <button onClick={() => seek(range.last)}>Go to out</button>
        <button onClick={range.reset}>Whole mix</button>
      </div>
      <p role="status">
        {range.last - range.first + 1} frames ·{' '}
        {((range.last - range.first + 1) / range.fps).toFixed(3)} s. Both endpoints included.
      </p>
    </section>
  );
}
function RangeEndpoint({
  label,
  value,
  count,
  update,
}: {
  label: string;
  value: number;
  count: number;
  update: (frame: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={0}
        max={count - 1}
        step={1}
        value={value}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (Number.isSafeInteger(next) && next >= 0 && next < count) update(next);
        }}
      />
    </label>
  );
}

import { useId, useMemo } from 'react';
import type { SetEnvelope } from '../../analysis.ts';
import { OverviewConfigSchema, type OverviewConfig } from '../../visualizers.ts';
import { useFrame } from '../frame.tsx';
import { linePath } from './svg.ts';

export { OverviewConfigSchema, type OverviewConfig };

const WIDTH = 1000;
const HEIGHT = 100;
const MIDDLE = HEIGHT / 2;

/**
 * The whole set as a strip: its energy, highs above the middle line and bass below it, a mark at
 * every event and a playhead. SVG so themes style it: `.sc-overview-high` and `.sc-overview-bass`
 * for the energy (again inside
 * `.sc-overview-played` for the part that has played), `.sc-overview-mark[data-type]` for events
 * and `.sc-overview-head` for the playhead.
 */
export function Overview() {
  const { timeSeconds, composition } = useFrame();
  const { project, durationSeconds } = composition;
  const playedId = useId();
  const xAt = (time: number) => (time / durationSeconds) * WIDTH;
  const head = xAt(timeSeconds);
  const energy = useMemo(
    () =>
      project.envelope && <Energy envelope={project.envelope} durationSeconds={durationSeconds} />,
    [project.envelope, durationSeconds],
  );

  return (
    <svg className="sc-overview" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
      <defs>
        <clipPath id={playedId}>
          <rect width={head} height={HEIGHT} />
        </clipPath>
      </defs>
      {energy}
      <g className="sc-overview-played" clipPath={`url(#${playedId})`}>
        {energy}
      </g>
      {project.events.map((event, index) => (
        <line
          key={index}
          className="sc-overview-mark"
          data-type={event.type}
          x1={xAt(event.time)}
          y1={0}
          x2={xAt(event.time)}
          y2={HEIGHT}
        />
      ))}
      <line className="sc-overview-head" x1={head} y1={0} x2={head} y2={HEIGHT} />
    </svg>
  );
}

function Energy({ envelope, durationSeconds }: { envelope: SetEnvelope; durationSeconds: number }) {
  const xAt = (index: number) => ((index + 0.5) * envelope.step * WIDTH) / durationSeconds;
  return (
    <>
      <path className="sc-overview-high" d={bandArea(envelope.high, xAt, -1)} />
      <path className="sc-overview-bass" d={bandArea(envelope.bass, xAt, 1)} />
    </>
  );
}

/** A band's levels as a closed shape growing from the middle line, up (-1) or down (1). */
function bandArea(levels: number[], xAt: (index: number) => number, direction: -1 | 1): string {
  const edge = levels.map((level, index) => ({
    x: xAt(index),
    y: MIDDLE + direction * level * MIDDLE,
  }));
  const end = { x: xAt(levels.length - 1), y: MIDDLE };
  const start = { x: xAt(0), y: MIDDLE };
  return `${linePath([...edge, end, start])} Z`;
}

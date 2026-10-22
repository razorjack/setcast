import type { PointerEvent, KeyboardEvent } from 'react';
import type { Projection, ProjectionPoint } from '@setcast/core';

const names = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'];
export function CornerEditor({
  config,
  change,
}: {
  config: Projection;
  change: (next: Projection) => void;
}) {
  const move = (index: number, point: ProjectionPoint) =>
    change({
      ...config,
      corners: config.corners.map((corner, row) =>
        row === index ? point : corner,
      ) as Projection['corners'],
    });
  return (
    <fieldset>
      <legend>Output corners (%)</legend>
      <CornerDiagram corners={config.corners} move={move} />
      <div className="sc-projection-numbers">
        {config.corners.map((point, index) => (
          <div key={index}>
            <FractionInput
              label={`${names[index]} X`}
              value={point[0]}
              change={(x) => move(index, [x, point[1]])}
            />
            <FractionInput
              label={`${names[index]} Y`}
              value={point[1]}
              change={(y) => move(index, [point[0], y])}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}
const bounded = (coordinate: number) =>
  Math.min(1, Math.max(0, Math.round(coordinate * 1000) / 1000));
function dragCorner(event: PointerEvent<SVGCircleElement>, move: (point: ProjectionPoint) => void) {
  if (!event.buttons || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
  const svg = event.currentTarget.ownerSVGElement!;
  const inverse = svg.getScreenCTM()!.inverse();
  const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
  move([bounded(local.x / 100), bounded(local.y / 100)]);
}
function nudgeCorner(
  event: KeyboardEvent<SVGCircleElement>,
  point: ProjectionPoint,
  move: (point: ProjectionPoint) => void,
) {
  const direction: Record<string, ProjectionPoint> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  const delta = direction[event.key];
  if (!delta) return;
  event.preventDefault();
  const step = event.shiftKey ? 0.01 : 0.001;
  move([bounded(point[0] + delta[0] * step), bounded(point[1] + delta[1] * step)]);
}
export function FractionInput({
  label,
  value,
  change,
}: {
  label: string;
  value: number;
  change: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        min={0}
        max={100}
        step={0.1}
        value={Math.round(value * 1000) / 10}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (Number.isFinite(next)) change(next / 100);
        }}
      />
    </label>
  );
}

function CornerDiagram({
  corners,
  move,
}: {
  corners: Projection['corners'];
  move: (index: number, point: ProjectionPoint) => void;
}) {
  return (
    <svg className="sc-corner-editor" viewBox="-5 -5 110 110" aria-label="Projector corner editor">
      <rect width="100" height="100" fill="#080b0e" stroke="#444b52" strokeWidth="0.3" />
      <path d="M50 0V100M0 50H100" stroke="#444b52" strokeWidth="0.3" />
      <polygon
        points={corners.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')}
        fill="#e8b85a18"
        stroke="var(--cue)"
        strokeWidth="0.5"
      />
      <CornerHandles corners={corners} move={move} />
    </svg>
  );
}

function CornerHandles({
  corners,
  move,
}: {
  corners: Projection['corners'];
  move: (index: number, point: ProjectionPoint) => void;
}) {
  return (
    <>
      {corners.map(([x, y], index) => (
        <g key={index}>
          <circle
            cx={x * 100}
            cy={y * 100}
            r="2.5"
            fill="var(--cue)"
            role="button"
            tabIndex={0}
            aria-label={`Move ${names[index]} corner`}
            onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
            onPointerMove={(event) => dragCorner(event, (point) => move(index, point))}
            onKeyDown={(event) => nudgeCorner(event, [x, y], (point) => move(index, point))}
          />
          <text
            x={x * 100}
            y={y * 100 + 1}
            textAnchor="middle"
            fontSize="3"
            fill="#111"
            pointerEvents="none"
          >
            {index + 1}
          </text>
        </g>
      ))}
    </>
  );
}

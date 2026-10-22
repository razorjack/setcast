import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Projection } from '@setcast/core';
import { projectionMatrix } from './projection-math.ts';

const frameHtml = `<!doctype html><html><head><style>
html,body { margin:0; width:100%; height:100%; overflow:hidden; background:black; }
.sc-live-scene { position:absolute; inset:0; }
.sc-live-scene[data-ready=false] { visibility:hidden; }
.sc-live-scene[data-ready=false] .sc-stage { visibility:hidden !important; }
.sc-calibration { position:absolute; inset:0; z-index:2147483647; background:black; }
.sc-calibration svg { width:100%; height:100%; display:block; }
</style></head><body></body></html>`;

export function ProjectionFrame({
  config,
  width,
  height,
  pattern,
  brightness,
  children,
}: {
  config: Projection;
  width: number;
  height: number;
  pattern: boolean;
  brightness: number;
  children: (document: Document) => ReactNode;
}) {
  const [owner, setOwner] = useState<Document | null>(null);
  const { top, right, bottom, left } = config.crop;
  return (
    <>
      <iframe
        title="Projected scene"
        className="sc-projection-frame"
        tabIndex={-1}
        srcDoc={frameHtml}
        onLoad={(event) => setOwner(event.currentTarget.contentDocument)}
        style={{
          width,
          height,
          transform: `matrix3d(${projectionMatrix(config.corners, width, height).join(',')})`,
          clipPath: `inset(${top * 100}% ${right * 100}% ${bottom * 100}% ${left * 100}%)`,
        }}
      />
      {owner &&
        createPortal(
          <>
            {children(owner)}
            {pattern && <CalibrationPattern brightness={brightness} aspect={width / height} />}
          </>,
          owner.body,
        )}
      <ProjectionMasks masks={config.masks} />
    </>
  );
}

function CalibrationPattern({ brightness, aspect }: { brightness: number; aspect: number }) {
  const height = 1000 / aspect;
  return (
    <div className="sc-calibration" aria-hidden="true">
      <svg viewBox={`0 0 1000 ${height}`} style={{ opacity: brightness }}>
        <defs>
          <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M100 0H0V100" fill="none" stroke="#465156" strokeWidth="2" />
          </pattern>
        </defs>
        <rect width="1000" height={height} fill="#101719" />
        <rect
          x="2"
          y="2"
          width="996"
          height={height - 4}
          fill="url(#grid)"
          stroke="#b6d5dc"
          strokeWidth="4"
        />
        <path d={`M500 0V${height}M0 ${height / 2}H1000`} stroke="#dfae51" strokeWidth="3" />
        <circle
          cx="500"
          cy={height / 2}
          r={Math.min(1000, height) * 0.2}
          stroke="#b6d5dc"
          strokeWidth="3"
          fill="none"
        />
        <g fill="#dbe9ec" fontFamily="sans-serif" fontSize="28">
          <text x="30" y="50">
            1 · TOP LEFT
          </text>
          <text x="970" y="50" textAnchor="end">
            2 · TOP RIGHT
          </text>
          <text x="970" y={height - 40} textAnchor="end">
            3 · BOTTOM RIGHT
          </text>
          <text x="30" y={height - 40}>
            4 · BOTTOM LEFT
          </text>
        </g>
      </svg>
    </div>
  );
}

function ProjectionMasks({ masks }: { masks: Projection['masks'] }) {
  return (
    <>
      {masks.map((mask, index) => (
        <div
          key={index}
          className="sc-projection-mask"
          style={{
            left: `${mask.left * 100}%`,
            top: `${mask.top * 100}%`,
            width: `${mask.width * 100}%`,
            height: `${mask.height * 100}%`,
          }}
        />
      ))}
    </>
  );
}

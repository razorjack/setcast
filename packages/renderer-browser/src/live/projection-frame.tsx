import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Projection } from '@setcast/core';
import { projectionMatrix } from './projection-math.ts';

const frameHtml = `<!doctype html><html><head><style>
html,body { margin:0; width:100%; height:100%; overflow:hidden; background:black; }
.sc-live-scene { position:absolute; inset:0; }
.sc-live-scene[data-ready=false] { visibility:hidden; }
.sc-live-scene[data-ready=false] .sc-stage { visibility:hidden !important; }
</style></head><body></body></html>`;

export function ProjectionFrame({
  config,
  width,
  height,
  children,
}: {
  config: Projection;
  width: number;
  height: number;
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
      {owner && createPortal(children(owner), owner.body)}
      <ProjectionMasks masks={config.masks} />
    </>
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

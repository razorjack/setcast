import { useEffect, useRef, useState } from 'react';
import type { ResolvedProject } from '@setcast/core';
import type { FramePreview } from './frame-preview.ts';
import type { Reference } from './reference.tsx';

export function PreviewViewport({
  project,
  session,
  reference,
}: {
  project: ResolvedProject;
  session: FramePreview;
  reference: Reference;
}) {
  const { viewport, scale } = useViewportScale(project);
  const [loadError, setLoadError] = useState<string | null>(null);
  return (
    <div className="sp-viewport" ref={viewport}>
      <div
        className="sp-canvas"
        style={{
          width: project.width,
          height: project.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <iframe
          src="/frame.html"
          title="Preview frame"
          tabIndex={-1}
          onLoad={(event) => {
            const driver = event.currentTarget.contentWindow?.setcastExport;
            if (driver) session.setDriver(driver);
            else
              setLoadError(
                'Frame driver did not load. Retry the frame or restart setcast preview.',
              );
          }}
          width={project.width}
          height={project.height}
        />
        <ReferenceLayer project={project} reference={reference} />
      </div>
      {session.busy && <div className="sp-preparing">Preparing frame {session.requested}</div>}
      {(session.error || loadError) && (
        <p className="sp-frame-error" role="alert">
          {session.error || loadError}
        </p>
      )}
    </div>
  );
}

function useViewportScale(project: ResolvedProject) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setScale(
          Math.min(
            entry.contentRect.width / project.width,
            entry.contentRect.height / project.height,
          ),
        );
    });
    observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, [project.width, project.height]);
  return { viewport, scale };
}

function ReferenceLayer({
  project,
  reference,
}: {
  project: ResolvedProject;
  reference: Reference;
}) {
  const image = reference.image;
  const compare = image && image.width === project.width && image.height === project.height;
  return (
    <>
      {compare && (
        <img
          className="sp-reference-image"
          src={image.url}
          alt=""
          style={{
            opacity: reference.mode === 'difference' ? 1 : reference.opacity,
            mixBlendMode: reference.mode === 'difference' ? 'difference' : 'normal',
          }}
        />
      )}
    </>
  );
}

import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { framesWithinMix, type ResolvedProject } from '@setcast/core';
import { usePreviewRevision } from './revision.ts';
import { useFramePreview } from './frame-preview.ts';
import { Inspector } from './inspector.tsx';
import { PreviewViewport } from './viewport.tsx';
import { PreviewTransport } from './transport.tsx';
import { ReferenceControls, useReference, type Reference } from './reference.tsx';

export function mountPreview(element: HTMLElement) {
  createRoot(element).render(<Preview />);
}
function Preview() {
  const state = usePreviewRevision();
  const reference = useReference();
  useEffect(() => {
    document.title = `${state.project?.title || 'Setcast'} · Browser preview`;
  }, [state.project?.title]);
  const [attempt, setAttempt] = useState(0);
  return (
    <main className="sp-preview">
      <header className="sp-header">
        <div>
          <strong>SETCAST</strong>
          <span>Browser preview</span>
        </div>
        <h1>{state.project?.title || 'Frame inspector'}</h1>
        <button onClick={() => setAttempt(attempt + 1)}>Retry frame</button>
      </header>
      {state.error && (
        <div className="sp-warning" role="alert">
          {state.error} {state.project && 'Showing the last valid project.'}
        </div>
      )}
      {state.project ? (
        <Workspace
          key={`${state.revision}:${attempt}`}
          project={state.project}
          reference={reference}
        />
      ) : (
        <p className="sp-loading">Loading project…</p>
      )}
    </main>
  );
}
function Workspace({ project, reference }: { project: ResolvedProject; reference: Reference }) {
  const count = framesWithinMix(project.mix.duration, project.fps);
  const session = useFramePreview(count, project.fps);
  return (
    <div
      className="sp-workspace"
      data-requested={session.requested}
      data-ready-frame={session.busy || session.error ? '' : session.inspection?.frame.frame}
    >
      <div className="sp-main">
        <div className="sp-composition-label">
          <span>
            {project.width} × {project.height} · {project.fps} fps
          </span>
          <span>{count.toLocaleString()} frames</span>
        </div>
        <PreviewViewport project={project} session={session} reference={reference} />
        <PreviewTransport session={session} count={count} fps={project.fps} />
      </div>
      <aside className="sp-inspector" aria-label="Frame inspector">
        <Inspector session={session} />
        <ReferenceControls reference={reference} width={project.width} height={project.height} />
      </aside>
    </div>
  );
}

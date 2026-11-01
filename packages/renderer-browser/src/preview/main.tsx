import { useEffect, useRef, useState, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { framesWithinMix, type ResolvedProject } from '@setcast/core';
import { usePreviewRevision } from './revision.ts';
import { useFramePreview } from './frame-preview.ts';
import { usePreviewPlayback, type PreviewPreferences } from './playback.ts';
import { MusicalNavigation, PreviewRange, usePreviewSelection } from './timeline.tsx';
import type { PreviewSelection } from './navigation.ts';
import { PreviewExports, ExportFrameControls, useExportQueue } from './exports.tsx';
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
  const selection = useRef<PreviewSelection | null>(null);
  const position = useRef<number | null>(null);
  const preferences = useRef<PreviewPreferences>({ mode: 'audio', volume: 1 });
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
          position={position}
          preferences={preferences}
          selection={selection}
          revision={state.revision}
          invalid={Boolean(state.error)}
        />
      ) : (
        <p className="sp-loading">Loading project…</p>
      )}
    </main>
  );
}
interface WorkspaceOptions {
  project: ResolvedProject;
  reference: Reference;
  position: RefObject<number | null>;
  preferences: RefObject<PreviewPreferences>;
  selection: RefObject<PreviewSelection | null>;
  revision: number;
  invalid: boolean;
}
function useWorkspace({
  project,
  reference,
  position,
  preferences,
  selection,
  revision,
  invalid,
}: WorkspaceOptions) {
  const range = usePreviewSelection(project, selection);
  const count = framesWithinMix(project.mix.duration, project.fps);
  const frames = useFramePreview(count, project.fps, position);
  const session = usePreviewPlayback(project, frames, preferences);
  const queue = useExportQueue();
  const [showExportFrame, setShowExportFrame] = useState(false);
  const captured = queue.state?.jobs.findLast(
    (job) =>
      job.kind === 'reference' && job.revision === revision && job.first === session.requested,
  );
  const pinnedImage =
    showExportFrame && !session.playing && !invalid && captured?.status === 'complete'
      ? `/exports/${captured.id}/file`
      : null;
  return {
    project,
    reference,
    range,
    count,
    session,
    queue,
    revision,
    invalid,
    showExportFrame,
    setShowExportFrame,
    pinnedImage,
  };
}
function Workspace(options: WorkspaceOptions) {
  const state = useWorkspace(options);
  const { project, count, session, reference, pinnedImage } = state;
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
        <PreviewViewport
          project={project}
          session={session}
          reference={reference}
          pinnedImage={pinnedImage}
        />
        <PreviewTransport session={session} count={count} fps={project.fps} />
      </div>
      <WorkspaceInspector state={state} />
    </div>
  );
}

function WorkspaceInspector({ state }: { state: ReturnType<typeof useWorkspace> }) {
  const {
    project,
    reference,
    range,
    session,
    queue,
    revision,
    invalid,
    showExportFrame,
    setShowExportFrame,
    pinnedImage,
  } = state;
  return (
    <aside className="sp-inspector" aria-label="Frame inspector">
      <MusicalNavigation project={project} frame={session.requested} seek={session.seek} />
      <PreviewRange range={range} frame={session.requested} seek={session.seek} />
      <ExportFrameControls
        queue={queue}
        revision={revision}
        frame={session.requested}
        invalid={invalid || session.playing}
        showing={showExportFrame}
        setShowing={setShowExportFrame}
      />
      <PreviewExports revision={revision} range={range} invalid={invalid} queue={queue} />
      <Inspector session={session} />
      <ReferenceControls
        reference={reference}
        width={project.width}
        height={project.height}
        pinnedImage={pinnedImage}
      />
    </aside>
  );
}

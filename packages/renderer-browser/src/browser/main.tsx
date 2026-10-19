import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ResolvedProject } from '@setcast/core';
import type { Transport } from '../transport.ts';
import { Controls } from './controls.tsx';
import { usePlayback, type PlaybackSnapshot } from './playback.ts';
import { Scene, SceneBoundary } from './scene.tsx';

export function mountPlayer(element: HTMLElement) {
  const root = createRoot(element);
  void fetch('/project.json')
    .then(async (response) => {
      if (!response.ok)
        throw new Error('Cannot load the project. Restart setcast play and reload this page.');
      const project = (await response.json()) as ResolvedProject;
      document.title = `${project.title || 'Setcast'} / Player`;
      root.render(<Player project={project} />);
    })
    .catch((error: unknown) => {
      root.render(<p role="alert">{String(error)}</p>);
    });
}

function Player({ project }: { project: ResolvedProject }) {
  const { audio, transport, snapshot } = usePlayback(project);
  const [clean, setClean] = useState(false);
  useKeyboard(transport, () => setClean(false));
  const fullscreen = () => {
    const pending = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    void pending.catch((error: unknown) => transport.fail(error));
  };
  return (
    <main
      className="sc-player"
      data-frame={snapshot.frame}
      data-windows={snapshot.windows}
      data-clean={clean}
    >
      <Viewport
        project={project}
        snapshot={snapshot}
        transport={transport}
        toggleControls={() => setClean(!clean)}
      />
      {!clean && (
        <Controls
          snapshot={snapshot}
          transport={transport}
          audio={audio}
          fullscreen={fullscreen}
          clean={() => setClean(true)}
        />
      )}
    </main>
  );
}

interface ViewportProps {
  project: ResolvedProject;
  snapshot: PlaybackSnapshot;
  transport: Transport;
  toggleControls: () => void;
}

function Viewport({ project, snapshot, transport, toggleControls }: ViewportProps) {
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
  }, [project]);
  return (
    <div ref={viewport} className="sc-player-viewport" onDoubleClick={toggleControls}>
      <div
        className="sc-player-canvas"
        style={{
          width: project.width,
          height: project.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <SceneBoundary onError={(error) => transport.fail(error)}>
          {snapshot.analyzer && (
            <Scene
              project={project}
              analyzer={snapshot.analyzer}
              frame={snapshot.frame}
              transport={transport}
              running={snapshot.running}
            />
          )}
        </SceneBoundary>
      </div>
      <PlaybackMessage snapshot={snapshot} />
    </div>
  );
}

function PlaybackMessage({ snapshot }: { snapshot: PlaybackSnapshot }) {
  if (snapshot.error)
    return (
      <div className="sc-player-message" role="alert">
        <strong>Playback stopped</strong>
        <p>{snapshot.error}</p>
        <button onClick={() => location.reload()}>Reload player</button>
      </div>
    );
  if (!snapshot.analyzer)
    return (
      <div className="sc-player-message" role="status">
        Preparing the set…
      </div>
    );
  return null;
}

function useKeyboard(transport: Transport, restoreControls: () => void) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') restoreControls();
      if ((event.target as HTMLElement).matches('input,button')) return;
      if (event.code !== 'Space') return;
      event.preventDefault();
      if (transport.wanted) transport.pause();
      else transport.play();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [transport, restoreControls]);
}

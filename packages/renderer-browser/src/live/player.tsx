import { useCallback, useMemo, useState } from 'react';
import type { ResolvedLiveProject } from '@setcast/core';
import { DropOverlay, useArt } from '../browser/art.tsx';
import { useShortcuts } from '../browser/keyboard.ts';
import { useThemes } from '../browser/themes.ts';
import { LiveDock } from './controls.tsx';
import { useLiveInput } from './input.ts';
import { LiveViewport } from './scene.tsx';

function useLiveScene(initial: ResolvedLiveProject, report: (message: string) => void) {
  const themes = useThemes(initial, report);
  const art = useArt(report);
  const [title, setTitle] = useState(initial.title);
  const [clock, setClock] = useState(initial.live.clock);
  const project = useMemo(() => {
    let background = themes.project.background;
    if (art.art.kind === 'none') background = null;
    if (art.art.kind === 'file') background = `${art.art.url}#${art.art.name}`;
    return { ...themes.project, background, title, live: { ...themes.project.live, clock } };
  }, [themes.project, art.art, title, clock]);
  return { themes, art, title, setTitle, clock, setClock, project };
}

export function LivePlayer({
  initial,
  startupNotice,
}: {
  initial: ResolvedLiveProject;
  startupNotice: string | null;
}) {
  const [notice, setNotice] = useState(startupNotice);
  const report = useCallback((message: string) => setNotice(message), []);
  const scene = useLiveScene(initial, report);
  const { themes, art, project } = scene;
  const [clean, setClean] = useState(false);
  const input = useLiveInput(initial);
  const fullscreen = () => {
    const action = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen();
    void action.catch(() => report('Fullscreen was refused. Use the browser fullscreen command.'));
  };
  useShortcuts({
    h: () => setClean((hidden) => !hidden),
    f: fullscreen,
    Escape: () => setClean(false),
    '[': () => themes.step(-1),
    ']': () => themes.step(1),
  });
  return (
    <main
      className="sc-player sc-live"
      data-clean={clean}
      data-frame={input.snapshot.frame}
      data-capture={input.snapshot.status.phase}
    >
      <LiveViewport
        project={project}
        analyzer={input.snapshot.analyzer}
        frame={input.snapshot.frame}
        report={report}
      />
      <div className="sc-live-controls" hidden={clean}>
        <LiveDock {...{ input, ...scene, report, fullscreen }} clean={() => setClean(true)} />
        <LiveNotice notice={notice} dismiss={() => setNotice(null)} />
      </div>
      {art.dragging && !clean && <DropOverlay />}
    </main>
  );
}

function LiveNotice({ notice, dismiss }: { notice: string | null; dismiss: () => void }) {
  if (!notice) return null;
  return (
    <div className="sc-live-notice" role="alert">
      <span>{notice}</span>
      <button onClick={dismiss} aria-label="Dismiss notice">
        ×
      </button>
    </div>
  );
}

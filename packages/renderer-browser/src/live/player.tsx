import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ResolvedLiveProject } from '@setcast/core';
import { DropOverlay, useArt } from '../browser/art.tsx';
import { useShortcuts } from '../browser/keyboard.ts';
import { useThemes } from '../browser/themes.ts';
import { LiveDock } from './controls.tsx';
import { useLiveInput } from './input.ts';
import { LiveViewport } from './scene.tsx';
import { useOperatorWindow } from './operator.tsx';
import { LiveDiagnostics, useDiagnostics } from './diagnostics.tsx';
import { LiveTempo, type Tempo } from './tempo.tsx';
import { SessionJournal, useSessionJournal } from './journal.tsx';

function useLiveScene(initial: ResolvedLiveProject, report: (message: string) => void) {
  const themes = useThemes(initial, report);
  const art = useArt(report);
  const [title, setTitle] = useState(initial.title);
  const [clock, setClock] = useState(initial.live.clock);
  const [tempo, setTempo] = useState<Tempo>({ bpm: initial.bpm, beatOffset: initial.beatOffset });
  const project = useMemo(() => {
    let background = themes.project.background;
    if (art.art.kind === 'none') background = null;
    if (art.art.kind === 'file') background = `${art.art.url}#${art.art.name}`;
    return {
      ...themes.project,
      ...tempo,
      background,
      title,
      live: { ...themes.project.live, clock },
    };
  }, [themes.project, art.art, title, clock, tempo]);
  return { themes, art, title, setTitle, clock, setClock, project, tempo, setTempo };
}

export function LivePlayer({
  initial,
  startupNotice,
}: {
  initial: ResolvedLiveProject;
  startupNotice: string | null;
}) {
  const controller = useLivePlayer(initial, startupNotice);
  const { scene, input, operator, clean, report } = controller;
  const { art, project } = scene;
  const controls = <LiveControls {...controller} />;
  return (
    <main
      className="sc-player sc-live"
      data-clean={clean}
      data-frame={input.snapshot.frame}
      data-capture={input.snapshot.status.phase}
      data-dropped={input.snapshot.status.dropped}
      data-cached={input.capture.audio?.cachedMoments ?? 0}
      data-pcm-capacity={input.capture.audio?.capacity ?? 0}
    >
      <LiveViewport
        project={project}
        analyzer={input.snapshot.analyzer}
        frame={input.snapshot.frame}
        report={report}
      />
      {operator.target ? createPortal(controls, operator.target) : controls}
      {art.dragging && !clean && <DropOverlay />}
    </main>
  );
}

function useLivePlayer(initial: ResolvedLiveProject, startupNotice: string | null) {
  const [notice, setNotice] = useState(startupNotice);
  const report = useCallback((message: string) => setNotice(message), []);
  const scene = useLiveScene(initial, report);
  const { themes, art, project } = scene;
  const [clean, setClean] = useState(false);
  const input = useLiveInput(initial);
  const diagnostics = useDiagnostics(input);
  const operator = useOperatorWindow(report);
  const journal = useSessionJournal({
    input,
    report,
    art: art.art,
    selection: {
      theme: project.theme,
      title: scene.title,
      clock: scene.clock,
      input: input.settings,
      bpm: project.bpm,
      beatOffset: project.beatOffset,
    },
  });
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
  return {
    scene,
    input,
    operator,
    clean,
    setClean,
    report,
    fullscreen,
    notice,
    setNotice,
    journal,
    diagnostics,
  };
}

function LiveControls({
  scene,
  input,
  operator,
  clean,
  setClean,
  report,
  fullscreen,
  notice,
  setNotice,
  journal,
  diagnostics,
}: ReturnType<typeof useLivePlayer>) {
  return (
    <div className="sc-live-controls" hidden={clean && !operator.target}>
      <LiveDock {...{ input, ...scene, report, fullscreen }} clean={() => setClean(true)} />
      <section className="sc-live-session">
        <button
          className="sc-button"
          onClick={() => {
            if (operator.target) operator.close();
            else operator.open();
            setClean(false);
          }}
        >
          {operator.target ? 'Return controls to output' : 'Operator window'}
        </button>
        <LiveTempo
          running={input.snapshot.status.phase === 'running'}
          tempo={scene.tempo}
          setTempo={scene.setTempo}
          time={() => input.capture.audio?.capturedTime ?? 0}
        />
        <LiveDiagnostics input={input} fps={scene.project.fps} diagnostics={diagnostics} />
        <SessionJournal journal={journal} running={input.snapshot.status.phase === 'running'} />
      </section>
      <LiveNotice notice={notice} dismiss={() => setNotice(null)} />
    </div>
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

import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ResolvedLiveProject } from '@setcast/core';
import type { Art } from '../browser/overrides.ts';
import { DropOverlay, useArt } from '../browser/art.tsx';
import { useShortcuts } from '../browser/keyboard.ts';
import { useThemes } from '../browser/themes.ts';
import { LiveDock } from './controls.tsx';
import { useLiveInput } from './input.ts';
import { LiveViewport } from './scene.tsx';
import { useOperatorWindow } from './operator.tsx';
import { LiveDiagnostics, useDiagnostics } from './diagnostics.tsx';
import { LiveTempo, type Tempo } from './tempo.tsx';
import { useLivePerformance } from './performance-session.ts';
import { PerformanceControls } from './performance-controls.tsx';
import { SessionJournal } from './journal.tsx';

export function useLiveScene(initial: ResolvedLiveProject, report: (message: string) => void) {
  const themes = useThemes(initial, report);
  const art = useArt(report);
  const [title, setTitle] = useState(initial.title);
  const [preset, setPreset] = useState<string | null>(null);
  const [clock, setClock] = useState(initial.live.clock);
  const [tempo, setTempo] = useState<Tempo>({ bpm: initial.bpm, beatOffset: initial.beatOffset });
  const project = useMemo(() => {
    const background = selectedBackground(themes.project.background, art.art);
    return {
      ...themes.project,
      ...tempo,
      background,
      title,
      live: { ...themes.project.live, clock },
    };
  }, [themes.project, art.art, title, clock, tempo]);
  const recall = (saved: ResolvedLiveProject, directory: string) => {
    themes.adopt({ ...saved, width: initial.width, height: initial.height, fps: initial.fps });
    art.setArt({ kind: 'project' });
    setTitle(saved.title);
    setClock(saved.live.clock);
    setPreset(directory);
  };
  const selectedThemes = {
    ...themes,
    step: (offset: number) => {
      setPreset(null);
      return themes.step(offset);
    },
    select: (name: string) => {
      setPreset(null);
      themes.select(name);
    },
  };
  return {
    themes: selectedThemes,
    art,
    title,
    setTitle,
    clock,
    setClock,
    project,
    tempo,
    setTempo,
    preset,
    recall,
  };
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
        performance={controller.performance.value()}
        onReady={controller.ready}
        onFailure={controller.performance.cancel}
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
  const [clean, setClean] = useState(false);
  const input = useLiveInput(initial);
  const diagnostics = useDiagnostics(input);
  const operator = useOperatorWindow(report);
  const performanceSession = useLivePerformance(initial, input, scene, report);
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
    '[': () => scene.themes.step(-1),
    ']': () => scene.themes.step(1),
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
    diagnostics,
    ...performanceSession,
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
  performance,
  bank,
  recall,
  midi,
  activePreset,
}: ReturnType<typeof useLivePlayer>) {
  return (
    <div className="sc-live-controls" hidden={clean && !operator.target}>
      <LiveDock
        {...{ input, ...scene, report, fullscreen }}
        performance={performance.target}
        clean={() => setClean(true)}
      />
      <PerformanceControls
        {...{ performance, bank, recall, report, midi }}
        running={input.snapshot.status.phase === 'running'}
        active={activePreset}
      />
      <section className="sc-live-session">
        <OperatorButton operator={operator} reveal={() => setClean(false)} />
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

function OperatorButton({
  operator,
  reveal,
}: {
  operator: ReturnType<typeof useOperatorWindow>;
  reveal: () => void;
}) {
  return (
    <button
      className="sc-button"
      onClick={() => {
        if (operator.target) operator.close();
        else operator.open();
        reveal();
      }}
    >
      {operator.target ? 'Return controls to output' : 'Operator window'}
    </button>
  );
}

function selectedBackground(background: string | null, art: Art) {
  if (art.kind === 'none') return null;
  if (art.kind === 'file') return `${art.url}#${art.name}`;
  return background;
}

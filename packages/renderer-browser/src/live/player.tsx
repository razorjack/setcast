import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ResolvedLiveProject } from '@setcast/core';
import { DropOverlay } from '../player/art.tsx';
import { useShortcuts } from '../player/keyboard.ts';
import type { Report } from '../player/report.ts';
import { LiveDock } from './controls.tsx';
import { useLiveInput, type LiveInput } from './input.ts';
import { LiveViewport } from './scene.tsx';
import { useOperatorWindow, type OperatorWindow } from './operator.tsx';
import { LiveDiagnostics, useDiagnostics } from './diagnostics.tsx';
import { LiveTempo } from './tempo.tsx';
import { useLiveShow, type LiveShow } from './show.ts';
import { PerformanceControls } from './performance-controls.tsx';
import { SessionJournal } from './journal.tsx';
import { useProjection } from './projection-settings.ts';
import { ProjectionControls } from './projection-controls.tsx';
import { OutputControls, useOutput } from './output.tsx';
import { BrandingControls } from './branding-controls.tsx';
import { useTestPattern } from './test-pattern.ts';
import { TestPatternControls } from './test-pattern-controls.tsx';
import { useSceneControl, type SceneControl } from './scene-control.ts';

export function LivePlayer({
  initial,
  startupNotice,
}: {
  initial: ResolvedLiveProject;
  startupNotice: string | null;
}) {
  const player = useLivePlayer(initial, startupNotice);
  const { scene, input, show, setup, operator, clean } = player;
  const controls = <LiveControls player={player} />;
  return (
    <main
      className="sc-player sc-live"
      data-clean={clean}
      data-frame={input.snapshot.frame}
      data-capture={input.snapshot.status.phase}
      data-dropped={input.snapshot.status.dropped}
      data-cached={input.capture.audio?.cachedMoments ?? 0}
      data-pcm-capacity={input.capture.audio?.capacity ?? 0}
      data-input-available={input.snapshot.status.available}
      data-render-scale={setup.output.renderScale}
    >
      <LiveViewport
        key={String(setup.projection.config.enabled)}
        projection={setup.projection.config}
        testPattern={setup.testPattern.active ? setup.testPattern.config : undefined}
        project={scene.project}
        analyzer={input.snapshot.analyzer}
        frame={input.snapshot.frame}
        announcements={show.announcements.list}
        report={player.report}
        performance={show.performance.value()}
        renderScale={setup.output.renderScale}
        black={setup.output.black}
        onReady={show.ready}
        onFailure={show.performance.cancel}
      />
      {operator.target ? createPortal(controls, operator.target) : controls}
      {scene.art.dragging && !clean && <DropOverlay />}
    </main>
  );
}

function useLivePlayer(initial: ResolvedLiveProject, startupNotice: string | null) {
  const [notice, setNotice] = useState(startupNotice);
  const report = useCallback((message: string) => setNotice(message), []);
  const [clean, setClean] = useState(false);
  const scene = useSceneControl(initial, report);
  const input = useLiveInput(initial);
  const operator = useOperatorWindow(report);
  const show = useLiveShow(initial, input, scene, report);
  const setup = useOutputSetup(initial, input, report, () => setClean(true));
  const fullscreen = () => {
    setClean(true);
    void setup.output.display.toggle();
  };
  useShortcuts({
    h: () => setClean((hidden) => !hidden),
    f: fullscreen,
    '[': () => scene.themes.step(-1),
    ']': () => scene.themes.step(1),
  });
  return {
    scene,
    input,
    show,
    setup,
    operator,
    report,
    notice,
    setNotice,
    clean,
    setClean,
    fullscreen,
    beatTracking: initial.live.beatTracking,
  };
}

type LivePlayerState = ReturnType<typeof useLivePlayer>;

/** The output window's own settings: display, quality, projection and the test pattern. */
function useOutputSetup(
  initial: ResolvedLiveProject,
  input: LiveInput,
  report: Report,
  cleanOutput: () => void,
) {
  const diagnostics = useDiagnostics(input);
  const output = useOutput(input, diagnostics, { fps: initial.fps, report, cleanOutput });
  const testPattern = useTestPattern(initial, report);
  const projection = useProjection(initial, report, testPattern);
  return { diagnostics, output, testPattern, projection };
}

type OutputSetup = ReturnType<typeof useOutputSetup>;

function LiveControls({ player }: { player: LivePlayerState }) {
  const { scene, input, show, operator, clean, setClean, report, fullscreen } = player;
  const { status } = input.snapshot;
  return (
    <div className="sc-live-controls" hidden={clean && !operator.target}>
      <LiveDock
        scene={scene}
        input={input}
        performance={show.performance.target}
        report={report}
        fullscreen={fullscreen}
        clean={() => setClean(true)}
      />
      <PerformanceControls
        show={show}
        available={status.available}
        running={status.phase === 'running'}
      />
      <LiveSession
        scene={scene}
        input={input}
        show={show}
        setup={player.setup}
        operator={operator}
        setClean={setClean}
        beatTracking={player.beatTracking}
      />
      <LiveNotice notice={player.notice} dismiss={() => player.setNotice(null)} />
    </div>
  );
}

function LiveSession({
  scene,
  input,
  show,
  setup,
  operator,
  setClean,
  beatTracking,
}: {
  scene: SceneControl;
  input: LiveInput;
  show: LiveShow;
  setup: OutputSetup;
  operator: OperatorWindow;
  setClean: (clean: boolean) => void;
  beatTracking: ResolvedLiveProject['live']['beatTracking'];
}) {
  return (
    <section className="sc-live-session">
      <OperatorButton operator={operator} setClean={setClean} />
      <LiveTempo
        input={input}
        tempo={scene.tempo}
        setTempo={scene.setTempo}
        tracking={beatTracking}
      />
      <BrandingControls branding={scene.branding} announcements={show.announcements} />
      <LiveDiagnostics input={input} fps={scene.project.fps} diagnostics={setup.diagnostics} />
      <OutputControls output={setup.output} />
      <TestPatternControls testPattern={setup.testPattern} />
      <ProjectionControls projection={setup.projection} />
      <SessionJournal journal={show.journal} running={input.snapshot.status.phase === 'running'} />
    </section>
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
  setClean,
}: {
  operator: OperatorWindow;
  setClean: (clean: boolean) => void;
}) {
  return (
    <button
      className="sc-button"
      onClick={() => {
        if (operator.target) {
          operator.close();
          setClean(false);
        } else if (operator.open()) setClean(true);
      }}
    >
      {operator.target ? 'Return controls to output' : 'Operator window'}
    </button>
  );
}

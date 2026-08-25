import { useMemo } from 'react';
import { modulationVars } from '../modulation.ts';
import { stageData, stageVars } from '../stage.ts';
import { Background } from './components/Background.tsx';
import { Header } from './components/Header.tsx';
import { NowPlaying } from './components/NowPlaying.tsx';
import { useFrame } from './frame.tsx';
import { useFontsReady } from './renderer.tsx';
import { resolveVisualizer } from './visualizers.ts';

/** The whole scene: theme CSS, background, visualizer, header, now-playing panel. */
export function Stage() {
  const { composition, events, modulation, timeSeconds } = useFrame();
  const { project, width, height } = composition;
  useFontsReady();
  const viz = useMemo(() => resolveVisualizer(project.visualizer), [project.visualizer]);
  return (
    <div
      className={`setcast sc-stage theme-${project.theme}`}
      {...stageData(events)}
      style={{
        width,
        height,
        ...stageVars(events, timeSeconds),
        ...modulationVars(modulation),
      }}
    >
      <style>{project.css}</style>
      <Background />
      <viz.Component config={viz.config} />
      <Header />
      <NowPlaying />
    </div>
  );
}

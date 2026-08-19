import { useMemo } from 'react';
import { modulationVars } from '../modulation.ts';
import { Background } from './components/Background.tsx';
import { Header } from './components/Header.tsx';
import { NowPlaying } from './components/NowPlaying.tsx';
import { useFrame } from './frame.tsx';
import { useFontsReady } from './renderer.tsx';
import { visualizers } from './visualizers.ts';

/** The whole scene: theme CSS, background, visualizer, header, now-playing panel. */
export function Stage() {
  const { composition, modulation } = useFrame();
  const { project, width, height } = composition;
  useFontsReady();
  const viz = useMemo(() => {
    const plugin = visualizers.get(project.visualizer.name);
    const config = plugin.schema.parse(project.visualizer);
    return { Component: plugin.component, config };
  }, [project.visualizer]);
  return (
    <div
      className={`setcast sc-stage theme-${project.theme}`}
      style={{ width, height, ...modulationVars(modulation) }}
    >
      <style>{project.css}</style>
      <Background />
      <viz.Component config={viz.config} />
      <Header />
      <NowPlaying />
    </div>
  );
}

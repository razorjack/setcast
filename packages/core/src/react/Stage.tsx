import { useMemo, type CSSProperties } from 'react';
import { modulationVars } from '../modulation.ts';
import { backgroundVars, currentBackground } from '../background.ts';
import { beatVars, stageData, stageVars } from '../stage.ts';
import { Background, useBackgroundArt } from './components/Background.tsx';
import { Header } from './components/Header.tsx';
import { NowPlaying } from './components/NowPlaying.tsx';
import { UpNext } from './components/UpNext.tsx';
import { useFrame } from './frame.tsx';
import { useFontsReady } from './renderer.tsx';
import { resolveVisualizer } from './visualizers.ts';

/** The whole scene: theme CSS, background, visualizers, header, now-playing panel, up next. */
export function Stage() {
  const { composition, mix, modulation, timeSeconds } = useFrame();
  const { project, width, height } = composition;
  useFontsReady();
  const background = currentBackground(mix, project.background);
  const backgroundArt = useBackgroundArt(background);
  const visualizers = useMemo(
    () => project.visualizers.map((config) => resolveVisualizer(config)),
    [project.visualizers],
  );

  const style: CSSProperties = {
    width,
    height,
    ...stageVars(mix, timeSeconds, composition.durationSeconds),
    ...beatVars(timeSeconds, project.bpm, project.beatOffset),
    ...modulationVars(modulation),
    ...backgroundVars(backgroundArt?.stats ?? null),
  };

  return (
    <div
      className={`setcast sc-stage theme-${project.theme}`}
      {...stageData(mix, background)}
      data-presentation={project.presentation}
      style={style}
    >
      <style>{project.css}</style>
      <Background />
      {visualizers.map(({ Component, config }, index) => (
        <Component key={index} config={config} />
      ))}
      <Header />
      <NowPlaying />
      <UpNext />
    </div>
  );
}

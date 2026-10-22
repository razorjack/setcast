import { useLayoutEffect, useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import { modulationVars } from '../modulation.ts';
import {
  artBehind,
  backgroundKind,
  backgroundVars,
  currentBackground,
  type ArtGrid,
  type FrameArea,
} from '../background.ts';
import { showsIdentity } from '../branding.ts';
import { beatVars, stageData, stageVars, travelVars } from '../stage.ts';
import { Background, useBackgroundArt } from './components/Background.tsx';
import { Branding } from './components/Branding.tsx';
import { Header } from './components/Header.tsx';
import { NowPlaying } from './components/NowPlaying.tsx';
import { Tracklist } from './components/Tracklist.tsx';
import { UpNext } from './components/UpNext.tsx';
import { useFrame } from './frame.tsx';
import { useFontsReady } from './renderer.tsx';
import { resolveVisualizer } from './visualizers.ts';

/**
 * The whole scene: theme CSS, background, visualizers, header, now-playing panel, either the
 * tracklist or up next, and branding.
 */
export function Stage() {
  const { composition } = useFrame();
  return (
    <div
      className="sc-output"
      style={{
        position: 'relative',
        isolation: 'isolate',
        width: composition.width,
        height: composition.height,
      }}
    >
      <div style={{ position: 'relative', zIndex: 0 }}>
        <SceneStage />
      </div>
      <OutputDimmer brightness={composition.performance?.brightness ?? 1} />
    </div>
  );
}

function SceneStage() {
  const { composition, mix, modulation, timeSeconds } = useFrame();
  const { project, width, height } = composition;
  useFontsReady(project.css);
  const background = currentBackground(mix, project.background);
  const backgroundArt = useBackgroundArt(background);
  // Themes lay the stage out by the art (data-bg-calm, --bg-*). Chrome does not repaint text in a
  // composited element that moves by a fraction of a pixel, so text painted before the art is
  // measured could stay a pixel off; the stage stays hidden, and unpainted, until then.
  const measuringArt = backgroundKind(background) === 'image' && backgroundArt === null;
  const stageRef = useRef<HTMLDivElement>(null);
  useArtBehind(stageRef, backgroundArt?.stats.grid ?? null);
  const visualizers = useMemo(
    () => project.visualizers.map((config) => resolveVisualizer(config)),
    [project.visualizers],
  );

  const style: CSSProperties = {
    width,
    height,
    visibility: measuringArt ? 'hidden' : undefined,
    ...stageVars(mix, timeSeconds, composition.durationSeconds),
    ...beatVars(timeSeconds, project.bpm, project.beatOffset),
    ...travelVars(project.travel, timeSeconds),
    ...modulationVars(modulation),
    ...backgroundVars(backgroundArt),
    '--performance-intensity': composition.performance?.intensity ?? 1,
    '--performance-brightness': composition.performance?.brightness ?? 1,
  };

  return (
    <div
      ref={stageRef}
      className={`setcast sc-stage theme-${project.theme}`}
      {...stageData(mix, background)}
      data-mode={project.mix === null ? 'live' : 'recorded'}
      data-bg-calm={backgroundArt?.stats.calm.anchor}
      data-presentation={project.presentation}
      data-brand-position={showsIdentity(project.branding) ? project.branding.position : undefined}
      style={style}
    >
      <style>{project.css}</style>
      <Background />
      {visualizers.map(({ Component, config }, index) => (
        <Component key={index} config={config} />
      ))}
      <Header />
      <NowPlaying />
      {project.tracklist ? <Tracklist counts={project.tracklist} /> : <UpNext />}
      <Branding />
    </div>
  );
}

/** The elements whose text a theme may need to keep legible over bright or busy parts of the art. */
const MEASURED_ELEMENTS =
  '.sc-header, .sc-set-title, .sc-clock, .sc-panel, .sc-next, .sc-tracklist, .sc-brand-identity, .sc-brand-message';
const LUMA_BEHIND = '--bg-luma-behind';
const DETAIL_BEHIND = '--bg-detail-behind';

/**
 * Sets `--bg-luma-behind` and `--bg-detail-behind` on each measured element to the art under its
 * box, every frame, since panels move. The previous values are removed before the boxes are read,
 * so every render tab measures the same layout whatever frame it rendered before, and all boxes
 * are read before any value is set, so the browser lays the frame out once.
 */
function useArtBehind(stageRef: RefObject<HTMLDivElement | null>, grid: ArtGrid | null): void {
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const elements = Array.from(stage.querySelectorAll<HTMLElement>(MEASURED_ELEMENTS));
    for (const element of elements) {
      element.style.removeProperty(LUMA_BEHIND);
      element.style.removeProperty(DETAIL_BEHIND);
    }
    if (!grid) return;

    const frame = stage.getBoundingClientRect();
    const areas = elements.map((element) => frameArea(element.getBoundingClientRect(), frame));
    for (const [index, element] of elements.entries()) {
      const behind = artBehind(grid, areas[index]!);
      if (!behind) continue;
      element.style.setProperty(LUMA_BEHIND, behind.luma.toFixed(3));
      element.style.setProperty(DETAIL_BEHIND, behind.detail.toFixed(3));
    }
  });
}

/** An element's box in fractions of the stage, which Remotion Studio may show scaled. */
const frameArea = (box: DOMRect, frame: DOMRect): FrameArea => ({
  left: (box.left - frame.left) / frame.width,
  top: (box.top - frame.top) / frame.height,
  right: (box.right - frame.left) / frame.width,
  bottom: (box.bottom - frame.top) / frame.height,
});

function OutputDimmer({ brightness }: { brightness: number }) {
  if (brightness === 1) return null;
  return (
    <div
      className="sc-output-dimmer"
      aria-hidden="true"
      style={{
        display: 'block',
        position: 'absolute',
        inset: 0,
        zIndex: 2147483647,
        background: 'black',
        opacity: 1 - brightness,
        pointerEvents: 'none',
      }}
    />
  );
}

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { currentBackground } from '../../background.ts';
import { useFrame } from '../frame.tsx';
import { Img } from '../renderer.tsx';
import {
  artPlacement,
  boxInStage,
  placeCopies,
  stageView,
  viewBoxToStage,
  type StageView,
} from './art-copy.ts';
import { useBackgroundArt } from './Background.tsx';
import type { Point } from './svg.ts';

/** Path data in stage pixels, given where a point of the visualizer's viewBox lands. */
export type Outline = (toStage: (point: Point) => Point) => string;

interface ArtRevealProps {
  /** The reveal's own class, such as `sc-spectrum-art`. */
  className: string;
  /** The visualizer's SVG; its box, as the theme places it, places the outline. */
  target: RefObject<SVGSVGElement | null>;
  outline: Outline;
  fillRule?: 'nonzero' | 'evenodd';
}

/**
 * The background art shown through a visualizer's shapes: a copy of the image placed over
 * `.sc-bg-img`, clipped to `outline` every frame. Both come from the frame's own layout, so the
 * reveal follows wherever the theme puts the visualizer and however it moves the background.
 * Video and a stage without art reveal nothing.
 */
export function ArtReveal({ className, target, outline, fillRule = 'nonzero' }: ArtRevealProps) {
  const { mix, composition } = useFrame();
  const art = useBackgroundArt(currentBackground(mix, composition.project.background));
  const revealRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const reveal = revealRef.current;
    const svg = target.current;
    if (!reveal || !svg) return;
    const stage = stageView(reveal, composition.width);
    if (!stage) return;
    const placement = artPlacement(stage);
    const path = outline(svgToStage(svg, stage));
    placeCopies(reveal, placement);
    reveal.style.clipPath = `path(${fillRule}, '${path}')`;
  });

  if (!art) return null;
  return (
    <div ref={revealRef} className={className}>
      <Img className="sc-bg-copy" src={art.src} />
    </div>
  );
}

function svgToStage(svg: SVGSVGElement, stage: StageView): (point: Point) => Point {
  const { width, height } = svg.viewBox.baseVal;
  const stretched = svg.getAttribute('preserveAspectRatio') === 'none';
  return viewBoxToStage(boxInStage(svg, stage), { width, height }, stretched);
}

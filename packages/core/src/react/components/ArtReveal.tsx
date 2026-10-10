import { useLayoutEffect, useRef, type RefObject } from 'react';
import { currentBackground } from '../../background.ts';
import { useFrame } from '../frame.tsx';
import { Img } from '../renderer.tsx';
import {
  artPlacement,
  boxInStage,
  placeCopy,
  stageView,
  viewBoxToStage,
  type ArtPlacement,
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
 * The art shown through a visualizer's shapes: a copy of the image placed over the art the theme
 * shows (`.sc-bg-img`, or `.sc-art` when the theme shows that), clipped to `outline` every frame.
 * Both come from the frame's own layout, so the reveal follows wherever the theme puts the
 * visualizer and however it moves the art. Video and a stage without art reveal nothing.
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
    placeCopy(copyOf(reveal, 'background'), shown(placement, 'background'));
    placeCopy(copyOf(reveal, 'art'), shown(placement, 'art'));
    reveal.style.clipPath = `path(${fillRule}, '${path}')`;
  });

  if (!art) return null;
  return (
    <div ref={revealRef} className={className}>
      <Img className="sc-bg-copy" src={art.src} />
      <Img className="sc-art-copy" src={art.original} />
    </div>
  );
}

/** The copy of `.sc-bg-img` or of `.sc-art`; only the copy of the art the theme shows is shown. */
const copyOf = (reveal: HTMLElement, of: ArtPlacement['shows']) =>
  reveal.querySelector<HTMLElement>(of === 'art' ? '.sc-art-copy' : '.sc-bg-copy')!;

const shown = (placement: ArtPlacement | null, of: ArtPlacement['shows']) =>
  placement?.shows === of ? placement : null;

function svgToStage(svg: SVGSVGElement, stage: StageView): (point: Point) => Point {
  const { width, height } = svg.viewBox.baseVal;
  const stretched = svg.getAttribute('preserveAspectRatio') === 'none';
  return viewBoxToStage(boxInStage(svg, stage), { width, height }, stretched);
}

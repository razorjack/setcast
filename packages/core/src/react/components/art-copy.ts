import type { Point } from './svg.ts';

/** A box in the stage's own pixels, the composition's, whatever scale the stage is shown at. */
export interface StageBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The stage as the browser shows it, and how many of its own pixels one shown pixel is. */
export interface StageView {
  element: HTMLElement;
  rect: DOMRect;
  scale: number;
}

/** The stage that holds `element`, which must be one of its children. */
export function stageView(element: Element, stageWidth: number): StageView | null {
  const stage = element.parentElement;
  if (!stage) return null;
  const rect = stage.getBoundingClientRect();
  if (rect.width === 0) return null;
  return { element: stage, rect, scale: stageWidth / rect.width };
}

/** Where `element` sits in the stage, transforms included. */
export function boxInStage(element: Element, stage: StageView): StageBox {
  const rect = element.getBoundingClientRect();
  return {
    left: (rect.left - stage.rect.left) * stage.scale,
    top: (rect.top - stage.rect.top) * stage.scale,
    width: rect.width * stage.scale,
    height: rect.height * stage.scale,
  };
}

/** Where the art is drawn, so a copy of it can be placed exactly over it. */
export interface ArtPlacement {
  /** The art the theme shows: `.sc-art`, the file at its own shape, or the background image. */
  shows: 'art' | 'background';
  box: StageBox;
  objectFit: string;
  objectPosition: string;
}

/** `.sc-art` when the theme shows it, else `.sc-bg-img`; null when the stage shows no image. */
export function artPlacement(stage: StageView): ArtPlacement | null {
  const art = stage.element.querySelector('.sc-bg .sc-art');
  if (art && getComputedStyle(art).display !== 'none') return placement('art', art, stage);
  const background = stage.element.querySelector('.sc-bg .sc-bg-img');
  if (background) return placement('background', background, stage);
  return null;
}

function placement(shows: ArtPlacement['shows'], image: Element, stage: StageView): ArtPlacement {
  const { objectFit, objectPosition } = getComputedStyle(image);
  return { shows, box: boxInStage(image, stage), objectFit, objectPosition };
}

/**
 * Puts `copy` over the art, so it shows the same pixels in the same place however the theme
 * places, moves or scales the art. `objectFit` overrides the art's own, for a copy of a
 * differently composed image. Null hides the copy.
 */
export function placeCopy(
  copy: HTMLElement,
  placement: ArtPlacement | null,
  objectFit = placement?.objectFit,
): void {
  if (!placement) {
    copy.style.display = 'none';
    return;
  }
  const { box, objectPosition } = placement;
  copy.style.display = '';
  copy.style.left = `${box.left}px`;
  copy.style.top = `${box.top}px`;
  copy.style.width = `${box.width}px`;
  copy.style.height = `${box.height}px`;
  copy.style.objectFit = objectFit ?? '';
  copy.style.objectPosition = objectPosition;
}

/**
 * Where a point of an SVG's viewBox lands in the stage, for an SVG whose box is `box`. A stretched
 * SVG (`preserveAspectRatio="none"`) scales each axis on its own; any other is scaled evenly and
 * centered, as the default `xMidYMid meet` places it.
 */
export function viewBoxToStage(
  box: StageBox,
  viewBox: { width: number; height: number },
  stretched: boolean,
): (point: Point) => Point {
  if (stretched) {
    const scaleX = box.width / viewBox.width;
    const scaleY = box.height / viewBox.height;
    return ({ x, y }) => ({ x: box.left + x * scaleX, y: box.top + y * scaleY });
  }
  const scale = Math.min(box.width / viewBox.width, box.height / viewBox.height);
  const left = box.left + (box.width - viewBox.width * scale) / 2;
  const top = box.top + (box.height - viewBox.height * scale) / 2;
  return ({ x, y }) => ({ x: left + x * scale, y: top + y * scale });
}

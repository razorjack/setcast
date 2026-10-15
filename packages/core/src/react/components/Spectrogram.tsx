import { useLayoutEffect, useRef } from 'react';
import { BIN_COUNT, level } from '../../audio.ts';
import { currentBackground } from '../../background.ts';
import { SpectrogramConfigSchema, type SpectrogramConfig } from '../../visualizers.ts';
import { useAudioHistory, useFrame, type AudioMoment } from '../frame.tsx';
import {
  artPlacement,
  boxInStage,
  objectRect,
  stageView,
  type ArtPlacement,
  type StageView,
} from './art-copy.ts';
import { useBackgroundArt, type BackgroundArt } from './Background.tsx';
import { loadImage, sizeOf } from './canvas.ts';
import { PreparedCache, usePrepared } from './prepared.ts';

export { SpectrogramConfigSchema, type SpectrogramConfig };

const COLUMNS_PER_SECOND = 30;

/**
 * The spectrum of the last `seconds`, scrolling left, bass at the bottom. A canvas, because
 * thousands of cells per frame are too many for SVG; the theme still owns its look through CSS.
 * Each cell's level is its opacity, blended smoothly into its neighbors. The cells take the CSS
 * `color`, or with `fill: art` the art the theme shows, placed over it, so the music shows the art
 * where it is loud. Opacity, blending, masks and filters apply to `.sc-spectrogram` as to any
 * element.
 */
export function Spectrogram({ config }: { config: SpectrogramConfig }) {
  const { timeSeconds, mix, composition } = useFrame();
  const { seconds, gain } = config;
  const history = useAudioHistory(seconds, Math.round(seconds * COLUMNS_PER_SECOND));
  const art = useBackgroundArt(currentBackground(mix, composition.project.background));
  const images = useArtImages(config.fill === 'art' ? art : null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas && stageView(canvas, composition.width);
    const context = canvas?.getContext('2d');
    if (!canvas || !stage || !context) return;
    fitToBox(canvas);
    paintLevels(context, { history, timeSeconds, seconds, gain });
    context.globalCompositeOperation = 'source-in';
    if (images) paintArt(context, images, stage);
    else paintColor(context, getComputedStyle(canvas).color);
    context.globalCompositeOperation = 'source-over';
  });

  return <canvas ref={canvasRef} className="sc-spectrogram" data-fill={config.fill} />;
}

/** One canvas pixel per stage pixel, so the art is as sharp as the theme shows it. */
function fitToBox(canvas: HTMLCanvasElement): void {
  if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
  if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight;
}

interface Columns {
  history: AudioMoment[];
  timeSeconds: number;
  seconds: number;
  gain: number;
}

/**
 * Every level as the opacity of white, one column per moment placed by its age, so the picture
 * scrolls smoothly between moments. Stretching one pixel per cell over the canvas blends the cells
 * into each other, so a tall spectrogram shows no grid.
 */
function paintLevels(context: CanvasRenderingContext2D, columns: Columns) {
  const { history, timeSeconds, seconds, gain } = columns;
  const { width, height } = context.canvas;
  const columnWidth = width / history.length;
  const left = width * (1 - (timeSeconds - history[0]!.time) / seconds) - columnWidth;
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(levelImage(history, gain), left, 0, columnWidth * (history.length + 1), height);
}

/**
 * One pixel per moment and bin, its alpha the level, bass in the bottom row. The newest moment is
 * there twice: it is up to one column old, and its copy reaches the right edge.
 */
function levelImage(history: AudioMoment[], gain: number): OffscreenCanvas {
  const columns = history.length + 1;
  const pixels = new Uint8ClampedArray(columns * BIN_COUNT * 4).fill(255);
  for (let column = 0; column < columns; column++) {
    const { audio } = history[Math.min(column, history.length - 1)]!;
    for (const [bin, value] of audio.bins.entries()) {
      const row = BIN_COUNT - 1 - bin;
      pixels[(row * columns + column) * 4 + 3] = level(value, gain, 0) ** 2 * 255;
    }
  }
  const image = new OffscreenCanvas(columns, BIN_COUNT);
  image.getContext('2d')!.putImageData(new ImageData(pixels, columns, BIN_COUNT), 0, 0);
  return image;
}

function paintColor(context: CanvasRenderingContext2D, color: string) {
  context.fillStyle = color;
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
}

/**
 * The art where the theme shows it, drawn the way it shows it. A theme that hides the art gets it
 * as the frame would show it.
 */
function paintArt(context: CanvasRenderingContext2D, images: ArtImages, stage: StageView) {
  const placement = shownArt(stage);
  const image = placement.shows === 'art' ? images.art : images.background;
  const { box, objectFit, objectPosition } = placement;
  const art = objectRect(sizeOf(image), box, objectFit, objectPosition);
  const canvas = boxInStage(context.canvas, stage);
  const scale = context.canvas.width / canvas.width;
  const left = (art.left - canvas.left) * scale;
  const top = (art.top - canvas.top) * scale;
  context.drawImage(image, left, top, art.width * scale, art.height * scale);
}

function shownArt(stage: StageView): ArtPlacement {
  const placement = artPlacement(stage);
  if (placement && placement.box.width > 0) return placement;
  const { width, height } = stage.rect;
  const frame = { left: 0, top: 0, width: width * stage.scale, height: height * stage.scale };
  return { shows: 'background', box: frame, objectFit: 'cover', objectPosition: '50% 50%' };
}

/** The art as `.sc-bg-img` and as `.sc-art` show it, decoded for drawing. */
interface ArtImages {
  background: HTMLImageElement;
  art: HTMLImageElement;
}

const artImages = new PreparedCache<ArtImages>('spectrogram');

function useArtImages(art: BackgroundArt | null): ArtImages | null {
  return usePrepared(artImages, art, artImagesKey, loadArtImages);
}

const artImagesKey = ({ src, original }: BackgroundArt) => `${src} ${original}`;

async function loadArtImages({ src, original }: BackgroundArt): Promise<ArtImages> {
  const [background, art] = await Promise.all([loadImage(src), loadImage(original)]);
  return { background, art };
}

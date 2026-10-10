import type { CSSProperties } from 'react';
import {
  currentBackground,
  enlargement,
  isVideoFile,
  measureBackground,
  resolveFit,
  type BackgroundFit,
  type BackgroundStats,
  type Size,
} from '../../background.ts';
import { useFrame } from '../frame.tsx';
import { Img, useAssetResolver, useHoldUntil, Video } from '../renderer.tsx';

/** The art is measured at the frame's shape, this many cells along its long side. */
const MEASURE_CELLS = 64;
/** The blurred copy behind contained art: blur as a share of the frame's long side. */
const FILL_BLUR = 0.03;
const FILL_BRIGHTNESS = 0.6;
/** Enlarged a little past the frame so the blur has no soft edge. */
const FILL_ZOOM = 1.1;

export function Background() {
  const { timeSeconds, mix, composition } = useFrame();
  const current = currentBackground(mix, composition.project.background);
  const art = useBackgroundArt(current);
  return (
    <div className="sc-bg" style={drift(timeSeconds)}>
      {current && isVideoFile(current) && <Video className="sc-bg-img" src={current} loop muted />}
      {art && <Img className="sc-bg-img" src={art.src} />}
      <div className="sc-bg-vignette" />
    </div>
  );
}

/** Three slow, mutually prime cycles, so the picture never quite repeats. */
function drift(timeSeconds: number): CSSProperties {
  return {
    '--bg-drift': 1.04 + 0.02 * Math.sin(timeSeconds / 23),
    '--bg-x': `${1.2 * Math.sin(timeSeconds / 31)}%`,
    '--bg-y': `${0.8 * Math.cos(timeSeconds / 37)}%`,
  };
}

/** An image background as the frame shows it: the art, or the art whole over a blurred copy. */
export interface BackgroundArt {
  src: string;
  stats: BackgroundStats;
}

interface ArtRequest {
  url: string;
  fit: BackgroundFit;
  frame: Size;
}

const preparing = new Map<string, Promise<BackgroundArt>>();
const prepared = new Map<string, BackgroundArt>();

/**
 * Holds the frame until the image background is fitted to the frame and measured, once per file.
 * A video or a stage without art returns null.
 */
export function useBackgroundArt(path: string | null): BackgroundArt | null {
  const { composition } = useFrame();
  const resolveAsset = useAssetResolver();
  const request: ArtRequest | null =
    path === null || isVideoFile(path)
      ? null
      : {
          url: resolveAsset(path),
          fit: composition.project.backgroundFit,
          frame: { width: composition.width, height: composition.height },
        };
  const key = request ? artKey(request) : 'none';
  const ready = useHoldUntil(`background:${key}`, () =>
    request ? prepareOnce(key, request) : Promise.resolve(),
  );
  if (!request || !ready) return null;
  return prepared.get(key) ?? null;
}

const artKey = ({ url, fit, frame }: ArtRequest) => `${url} ${fit} ${frame.width}x${frame.height}`;

function prepareOnce(key: string, request: ArtRequest): Promise<BackgroundArt> {
  const pending = preparing.get(key);
  if (pending) return pending;
  const art = prepareArt(request).then((ready) => {
    prepared.set(key, ready);
    return ready;
  });
  preparing.set(key, art);
  return art;
}

async function prepareArt({ url, fit, frame }: ArtRequest): Promise<BackgroundArt> {
  const image = await loadImage(url);
  if (resolveFit(fit, sizeOf(image), frame) === 'cover') {
    return { src: url, stats: measure(image, frame) };
  }

  const composed = containOverBlur(image, frame);
  const src = URL.createObjectURL(await composed.convertToBlob());
  return { src, stats: measure(composed, frame) };
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode().catch((cause: unknown) => {
    throw new Error(`Failed to load ${url}`, { cause });
  });
  return image;
}

/** The whole art centered over a darker, blurred copy that covers the frame. */
function containOverBlur(image: HTMLImageElement, frame: Size): OffscreenCanvas {
  const canvas = new OffscreenCanvas(frame.width, frame.height);
  const context = context2d(canvas);
  const blur = Math.round(Math.max(frame.width, frame.height) * FILL_BLUR);
  context.filter = `blur(${blur}px) brightness(${FILL_BRIGHTNESS})`;
  drawFitted(context, image, 'cover', FILL_ZOOM);
  context.filter = 'none';
  drawFitted(context, image, 'contain', 1);
  return canvas;
}

/** Draws the art centered on the whole canvas, scaled to `fit` it and then by `zoom`. */
function drawFitted(
  context: OffscreenCanvasRenderingContext2D,
  art: HTMLImageElement | OffscreenCanvas,
  fit: 'cover' | 'contain',
  zoom: number,
): void {
  const frame = { width: context.canvas.width, height: context.canvas.height };
  const size = sizeOf(art);
  const scale = enlargement(size, frame, fit) * zoom;
  const width = size.width * scale;
  const height = size.height * scale;
  context.drawImage(art, (frame.width - width) / 2, (frame.height - height) / 2, width, height);
}

const sizeOf = (art: HTMLImageElement | OffscreenCanvas): Size =>
  art instanceof HTMLImageElement
    ? { width: art.naturalWidth, height: art.naturalHeight }
    : { width: art.width, height: art.height };

/** Measures the art cropped as the frame shows it, so the luma grid lines up with the stage. */
function measure(art: HTMLImageElement | OffscreenCanvas, frame: Size): BackgroundStats {
  const scale = MEASURE_CELLS / Math.max(frame.width, frame.height);
  const size = { width: Math.round(frame.width * scale), height: Math.round(frame.height * scale) };
  const context = context2d(new OffscreenCanvas(size.width, size.height));
  context.imageSmoothingQuality = 'high';
  drawFitted(context, art, 'cover', 1);
  return measureBackground(context.getImageData(0, 0, size.width, size.height).data, size);
}

/** A CPU-backed context, so the composed and measured pixels are the same in every render. */
function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Background needs a 2D canvas context; none is available.');
  return context;
}

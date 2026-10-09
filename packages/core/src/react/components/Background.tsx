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

const MEASURE_SIZE: Size = { width: 64, height: 36 };
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
  const art = { width: image.naturalWidth, height: image.naturalHeight };
  if (resolveFit(fit, art, frame) === 'cover') return { src: url, stats: measure(image) };

  const composed = containOverBlur(image, frame);
  const src = URL.createObjectURL(await composed.convertToBlob());
  return { src, stats: measure(composed) };
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

/** Draws the image centered on the whole canvas, scaled to `fit` it and then by `zoom`. */
function drawFitted(
  context: OffscreenCanvasRenderingContext2D,
  image: HTMLImageElement,
  fit: 'cover' | 'contain',
  zoom: number,
): void {
  const frame = { width: context.canvas.width, height: context.canvas.height };
  const art = { width: image.naturalWidth, height: image.naturalHeight };
  const scale = enlargement(art, frame, fit) * zoom;
  const width = art.width * scale;
  const height = art.height * scale;
  context.drawImage(image, (frame.width - width) / 2, (frame.height - height) / 2, width, height);
}

function measure(source: HTMLImageElement | OffscreenCanvas): BackgroundStats {
  const canvas = new OffscreenCanvas(MEASURE_SIZE.width, MEASURE_SIZE.height);
  const context = context2d(canvas);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, MEASURE_SIZE.width, MEASURE_SIZE.height);
  return measureBackground(
    context.getImageData(0, 0, MEASURE_SIZE.width, MEASURE_SIZE.height).data,
  );
}

/** A CPU-backed context, so the composed and measured pixels are the same in every render. */
function context2d(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Background needs a 2D canvas context; none is available.');
  return context;
}

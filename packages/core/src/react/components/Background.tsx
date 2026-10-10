import type { CSSProperties } from 'react';
import {
  currentBackground,
  isVideoFile,
  measureBackground,
  resolveFit,
  type BackgroundFit,
  type BackgroundStats,
  type MeasuredArt,
  type Size,
} from '../../background.ts';
import { useFrame } from '../frame.tsx';
import { Img, useAssetResolver, Video } from '../renderer.tsx';
import { context2d, drawFitted, loadImage, sizeOf } from './canvas.ts';
import { PreparedCache, usePrepared } from './prepared.ts';

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
      {art && <Img className="sc-art" src={art.original} />}
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

/** An image background: the file, and the art as the frame shows it. */
export interface BackgroundArt extends MeasuredArt {
  /** The art fitted to the frame: the file itself, or the art whole over a blurred copy. */
  src: string;
  /** The file as it is, at its own shape. */
  original: string;
  /** How `src` shows the file: cropped to the frame, or whole over a blurred copy. */
  fit: 'cover' | 'contain';
}

interface ArtRequest {
  url: string;
  fit: BackgroundFit;
  frame: Size;
}

const arts = new PreparedCache<BackgroundArt>('background');

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
  return usePrepared(arts, request, artKey, prepareArt);
}

const artKey = ({ url, fit, frame }: ArtRequest) => `${url} ${fit} ${frame.width}x${frame.height}`;

async function prepareArt({ url, fit, frame }: ArtRequest): Promise<BackgroundArt> {
  const image = await loadImage(url);
  const size = sizeOf(image);
  const aspect = size.width / size.height;
  if (resolveFit(fit, size, frame) === 'cover') {
    return { src: url, original: url, fit: 'cover', aspect, stats: measure(image, frame) };
  }

  const composed = containOverBlur(image, frame);
  const src = URL.createObjectURL(await composed.convertToBlob());
  return { src, original: url, fit: 'contain', aspect, stats: measure(composed, frame) };
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

/** Measures the art cropped as the frame shows it, so the luma grid lines up with the stage. */
function measure(art: HTMLImageElement | OffscreenCanvas, frame: Size): BackgroundStats {
  const scale = MEASURE_CELLS / Math.max(frame.width, frame.height);
  const size = { width: Math.round(frame.width * scale), height: Math.round(frame.height * scale) };
  const context = context2d(new OffscreenCanvas(size.width, size.height));
  context.imageSmoothingQuality = 'high';
  drawFitted(context, art, 'cover', 1);
  return measureBackground(context.getImageData(0, 0, size.width, size.height).data, size);
}

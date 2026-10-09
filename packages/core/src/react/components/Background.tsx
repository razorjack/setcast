import type { CSSProperties } from 'react';
import {
  currentBackground,
  isVideoFile,
  measureBackground,
  type BackgroundStats,
} from '../../background.ts';
import { useFrame } from '../frame.tsx';
import { Img, useAssetResolver, useHoldUntil, Video } from '../renderer.tsx';

const MEASURE_WIDTH = 64;
const MEASURE_HEIGHT = 36;

export function Background() {
  const { timeSeconds, mix, composition } = useFrame();
  const current = currentBackground(mix, composition.project.background);
  return (
    <div className="sc-bg" style={drift(timeSeconds)}>
      {current && <Layer src={current} className="sc-bg-img" />}
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

const Layer = ({ src, className }: { src: string; className: string }) =>
  isVideoFile(src) ? (
    <Video className={className} src={src} loop muted />
  ) : (
    <Img className={className} src={src} />
  );

const measured = new Map<string, BackgroundStats>();

/**
 * Holds the frame until the background image has been measured, once per file. A video or a
 * stage without art has nothing to measure and returns null.
 */
export function useBackgroundStats(path: string | null): BackgroundStats | null {
  const resolveAsset = useAssetResolver();
  const url = path === null || isVideoFile(path) ? null : resolveAsset(path);
  const ready = useHoldUntil(`measure:${url ?? 'none'}`, () =>
    url ? measureImage(url) : Promise.resolve(),
  );
  if (!url || !ready) return null;
  return measured.get(url) ?? null;
}

async function measureImage(url: string): Promise<void> {
  if (measured.has(url)) return;
  const image = new Image();
  image.src = url;
  await image.decode().catch((cause: unknown) => {
    throw new Error(`Failed to load ${url}`, { cause });
  });

  const canvas = new OffscreenCanvas(MEASURE_WIDTH, MEASURE_HEIGHT);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('measureImage() needs a 2D canvas context; none is available.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, MEASURE_WIDTH, MEASURE_HEIGHT);
  const pixels = context.getImageData(0, 0, MEASURE_WIDTH, MEASURE_HEIGHT).data;
  measured.set(url, measureBackground(pixels));
}

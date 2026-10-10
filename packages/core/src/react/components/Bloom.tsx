import { useLayoutEffect, useRef } from 'react';
import { level, type FeatureSource } from '../../audio.ts';
import { currentBackground, type Size } from '../../background.ts';
import { lightLayers } from '../../lights.ts';
import { smoothedFeature } from '../../modulation.ts';
import { BloomConfigSchema, type BloomConfig } from '../../visualizers.ts';
import { useFrame, type RenderFrame } from '../frame.tsx';
import { Img } from '../renderer.tsx';
import { artPlacement, placeCopy, stageView, type ArtPlacement } from './art-copy.ts';
import { useBackgroundArt, type BackgroundArt } from './Background.tsx';
import { context2d, drawFitted, loadImage } from './canvas.ts';
import { PreparedCache, usePrepared } from './prepared.ts';

export { BloomConfigSchema, type BloomConfig };

/** The lights are found in a copy of the art this many pixels along its long side. */
const LIGHT_CELLS = 480;

/**
 * The art's own lights glowing with the music. Once per image, the lamps, signs and suns of the
 * file are picked out, blurred into a glow and split by hue into one layer per band. Each frame
 * only the layers' `--level` changes. `.sc-bloom-light[data-band]` holds a `.sc-bloom-glow` placed
 * over the art the theme shows; base.css screens it over the art at its level. Video and a stage
 * without art draw nothing.
 */
export function Bloom({ config }: { config: BloomConfig }) {
  const frame = useFrame();
  const { mix, composition } = frame;
  const art = useBackgroundArt(currentBackground(mix, composition.project.background));
  const lights = useLights(art, config);
  const bloomRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const bloom = bloomRef.current;
    if (!bloom || !art) return;
    const stage = stageView(bloom, composition.width);
    if (!stage) return;
    const placement = artPlacement(stage);
    const fit = glowFit(art, placement);
    for (const glow of bloom.querySelectorAll<HTMLElement>('.sc-bloom-glow')) {
      placeCopy(glow, placement, fit);
    }
  });

  if (!lights) return null;
  return (
    <div ref={bloomRef} className="sc-bloom">
      {lights.map((src, index) => {
        const band = config.bands[index]!;
        return (
          <BloomLight key={index} src={src} band={band} level={bandLevel(frame, band, config)} />
        );
      })}
    </div>
  );
}

interface BloomLightProps {
  src: string;
  band: FeatureSource;
  level: number;
}

function BloomLight({ src, band, level }: BloomLightProps) {
  return (
    <div className="sc-bloom-light" data-band={band} style={{ '--level': level }}>
      <Img className="sc-bloom-glow" src={src} />
    </div>
  );
}

function bandLevel(frame: RenderFrame, band: FeatureSource, { gain, smooth }: BloomConfig): number {
  const { timeSeconds, fps, analyzer } = frame;
  const feature = smoothedFeature(band, smooth, { time: timeSeconds, fps, analyzer });
  return Math.round(level(feature, gain, 0) * 1000) / 1000;
}

/**
 * The glow is the file's own shape. Over `.sc-art` it takes the art's fit; over a background that
 * shows the file whole over a blurred copy, it covers only the file.
 */
function glowFit(art: BackgroundArt, placement: ArtPlacement | null): string | undefined {
  if (placement?.shows === 'background' && art.fit === 'contain') return 'contain';
  return placement?.objectFit;
}

interface LightsRequest {
  art: BackgroundArt;
  lights: number;
  radius: number;
  layers: number;
}

const prepared = new PreparedCache<string[]>('lights');

/** One glow image per band, prepared once per file and setting. */
function useLights(art: BackgroundArt | null, config: BloomConfig): string[] | null {
  const request: LightsRequest | null = art && {
    art,
    lights: config.lights,
    radius: config.radius,
    layers: config.bands.length,
  };
  return usePrepared(prepared, request, lightsKey, prepareLights);
}

const lightsKey = ({ art, lights, radius, layers }: LightsRequest) =>
  `${art.original} ${art.stats.colors.join()} ${lights} ${radius} ${layers}`;

async function prepareLights(request: LightsRequest): Promise<string[]> {
  const { art } = request;
  const scale = LIGHT_CELLS / Math.max(art.aspect, 1);
  const size = { width: Math.round(scale * art.aspect), height: Math.round(scale) };
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = context2d(canvas);
  context.imageSmoothingQuality = 'high';
  drawFitted(context, await loadImage(art.original), 'cover', 1);

  const pixels = context.getImageData(0, 0, size.width, size.height).data;
  const layers = lightLayers(pixels, size, {
    share: request.lights,
    colors: art.stats.colors,
    layers: request.layers,
  });
  const radius = request.radius * LIGHT_CELLS;
  return Promise.all(layers.map((layer) => glowUrl(layer, size, radius)));
}

/** The lights blurred into a wide halo around a tighter core, as a blob URL. */
async function glowUrl(
  layer: Uint8ClampedArray<ArrayBuffer>,
  size: Size,
  radius: number,
): Promise<string> {
  const lights = new OffscreenCanvas(size.width, size.height);
  context2d(lights).putImageData(new ImageData(layer, size.width, size.height), 0, 0);
  const glow = new OffscreenCanvas(size.width, size.height);
  const context = context2d(glow);
  context.globalCompositeOperation = 'lighter';
  context.filter = `blur(${radius}px)`;
  context.drawImage(lights, 0, 0);
  context.drawImage(lights, 0, 0);
  context.filter = `blur(${radius / 4}px)`;
  context.drawImage(lights, 0, 0);
  return URL.createObjectURL(await glow.convertToBlob());
}

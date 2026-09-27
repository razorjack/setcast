import { useLayoutEffect, useRef } from 'react';
import { BIN_COUNT, level } from '../../audio.ts';
import { SpectrogramConfigSchema, type SpectrogramConfig } from '../../visualizers.ts';
import { useAudioHistory, useFrame, type AudioMoment } from '../frame.tsx';

export { SpectrogramConfigSchema, type SpectrogramConfig };

const COLUMNS_PER_SECOND = 30;
const WIDTH = 960;
const HEIGHT = 256;

/**
 * The spectrum of the last `seconds`, scrolling left, bass at the bottom. A canvas, because
 * thousands of cells per frame are too many for SVG; the theme still owns its look through CSS:
 * `color` is the color of a full-strength cell, and opacity, blending, masks and filters apply
 * to `.sc-spectrogram` as to any element.
 */
export function Spectrogram({ config }: { config: SpectrogramConfig }) {
  const { timeSeconds } = useFrame();
  const { seconds, gain } = config;
  const history = useAudioHistory(seconds, Math.round(seconds * COLUMNS_PER_SECOND));
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = getComputedStyle(canvas).color;
    paintColumns(context, { history, timeSeconds, seconds, gain });
  });

  return <canvas ref={canvasRef} className="sc-spectrogram" width={WIDTH} height={HEIGHT} />;
}

interface Columns {
  history: AudioMoment[];
  timeSeconds: number;
  seconds: number;
  gain: number;
}

/** One column per moment, placed by its age so the picture scrolls smoothly between moments. */
function paintColumns(context: CanvasRenderingContext2D, columns: Columns) {
  const { history, timeSeconds, seconds, gain } = columns;
  const columnWidth = WIDTH / history.length;
  const rowHeight = HEIGHT / BIN_COUNT;
  const lastIndex = history.length - 1;

  history.forEach(({ time, audio }, index) => {
    const left = WIDTH * (1 - (timeSeconds - time) / seconds) - columnWidth;
    // The newest moment is up to one column old; stretch it to the edge instead of leaving a gap.
    const width = index === lastIndex ? WIDTH - left : columnWidth;
    audio.bins.forEach((bin, row) => {
      context.globalAlpha = level(bin, gain, 0) ** 2;
      context.fillRect(left, HEIGHT - (row + 1) * rowHeight, width, rowHeight);
    });
  });
  context.globalAlpha = 1;
}

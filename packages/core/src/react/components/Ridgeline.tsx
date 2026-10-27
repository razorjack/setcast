import { useId, useLayoutEffect, useRef } from 'react';
import { scaleLevel, type AudioFeatures } from '../../audio/audio.ts';
import { currentBackground, type Size } from '../../background.ts';
import {
  colorAt,
  heightAt,
  reliefField,
  spectrumBand,
  spectrumLift,
  type ReliefField,
} from '../../ridgeline.ts';
import { RidgelineConfigSchema, type RidgelineConfig } from '../../visualizers.ts';
import { audioHistory, useFrame, type RenderFrame } from '../frame.tsx';
import { boxInStage, stageView, type StageBox } from './art-copy.ts';
import { useBackgroundArt, type BackgroundArt } from './Background.tsx';
import { context2d, drawFitted, loadImage } from './canvas.ts';
import { PreparedCache, usePrepared } from './prepared.ts';
import { smoothPath, type Point } from './svg.ts';

export { RidgelineConfigSchema, type RidgelineConfig };

/** Points along each line. */
const POINTS = 161;
/** Room above the top line for its peaks, as a share of the box's height. */
const HEADROOM = 0.26;
/** How far a full-scale level raises its line, as a share of the box's height. */
const PEAK_LIFT = 0.2;
/** How far the art's brightest part raises a line at `relief: 1`, in line spacings. */
const RELIEF_SPACINGS = 12;
/** The art is read at the frame's shape, this many cells along its long side. */
const FIELD_CELLS = 240;
/** Blur before reading, in cells, so busy art raises shapes rather than noise. */
const FIELD_BLUR = 1;
/** The lines and the ground under them run this far past the box, which clips them. */
const BLEED = 8;
/** Colors along each line with `fill: art`, read from the art where they sit. */
const STOPS = 33;

/**
 * The recent spectrum as lines stacked up the box: this frame's at the bottom, and above it the
 * moments of the last `seconds`, each rising with its age. The art raises the lines where it is
 * bright, so in silence they draw it like an engraving, and the music climbs up through it. SVG:
 * one `.sc-ridgeline-line` per line, oldest first, with its `--age` (0 now .. 1 leaving at the
 * top), closed below so its `fill` hides the lines behind it. With `fill: art`, each line is
 * stroked in the art's colors along it.
 */
export function Ridgeline({ config }: { config: RidgelineConfig }) {
  const frame = useFrame();
  const { mix, composition } = frame;
  const art = useBackgroundArt(currentBackground(mix, composition.project.background));
  const field = useReliefField(art, composition);
  const lines = ridgeMoments(frame, config);
  const focusX = art?.stats.focus.x ?? 0.5;
  const inArt = config.fill === 'art' && field !== null;
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const stage = stageView(svg, composition.width);
    if (!stage) return;
    const box = boxInStage(svg, stage);
    const ridges = ridgeLines({ box, frame: composition, lines, field, focusX, config });
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    for (const [line, path] of svg.querySelectorAll('path').entries()) {
      path.setAttribute('d', ridges[line]!.path);
    }
    if (!inArt) return;
    for (const [line, gradient] of svg.querySelectorAll('linearGradient').entries()) {
      gradient.setAttribute('x2', String(box.width));
      for (const [index, stop] of gradient.querySelectorAll('stop').entries()) {
        stop.setAttribute('stop-color', ridges[line]!.colors[index]!);
      }
    }
  });

  return (
    <svg ref={svgRef} className="sc-ridgeline" data-fill={config.fill} preserveAspectRatio="none">
      {inArt && <LineColors id={gradientId} lines={lines.length} />}
      {lines.map(({ age }, line) => (
        <path
          key={line}
          className="sc-ridgeline-line"
          style={{
            '--age': Math.round(age * 1000) / 1000,
            stroke: inArt ? `url("#${gradientId}-${line}")` : undefined,
          }}
        />
      ))}
    </svg>
  );
}

/** One gradient across the box per line, its colors set from the art every frame. */
function LineColors({ id, lines }: { id: string; lines: number }) {
  const offsets = Array.from({ length: STOPS }, (_, index) => index / (STOPS - 1));
  return (
    <defs>
      {Array.from({ length: lines }, (_, line) => (
        <linearGradient
          key={line}
          id={`${id}-${line}`}
          gradientUnits="userSpaceOnUse"
          x1={0}
          x2={1}
        >
          {offsets.map((offset) => (
            <stop key={offset} offset={offset} />
          ))}
        </linearGradient>
      ))}
    </defs>
  );
}

/** The audio of one line: how far it has risen, 0 now .. 1 at the top, and its levels. */
interface RidgeMoment {
  age: number;
  levels: number[];
}

/**
 * The moments of the history grid, oldest first, then this frame's. Each moment keeps its line
 * as it rises, so a peak climbs the stack in one piece. Levels are squared, so peaks stand out of
 * the music's constant hum.
 */
function ridgeMoments(
  frame: RenderFrame,
  { lines, seconds, gain }: RidgelineConfig,
): RidgeMoment[] {
  const levelsOf = (audio: AudioFeatures) => audio.bins.map((bin) => scaleLevel(bin, gain, 0) ** 2);
  const past = audioHistory(frame, seconds, lines).map(({ time, audio }) => ({
    age: (frame.timeSeconds - time) / seconds,
    levels: levelsOf(audio),
  }));
  return [...past, { age: 0, levels: levelsOf(frame.audio) }];
}

interface Ridges {
  /** The SVG's box in the stage. */
  box: StageBox;
  frame: Size;
  lines: RidgeMoment[];
  field: ReliefField | null;
  /** Where the art's subject is, in fractions of the frame's width. */
  focusX: number;
  config: RidgelineConfig;
}

/** A line's path data in the box's own pixels, and the art's colors along it. */
interface Ridge {
  path: string;
  colors: string[];
}

/**
 * Every line, oldest first. The art is read where each point sits in the frame, so the relief
 * stays in place wherever the theme puts the box.
 */
function ridgeLines({ box, frame, lines, field, focusX, config }: Ridges): Ridge[] {
  const { width, height } = box;
  const rise = height * (1 - HEADROOM);
  const spacing = rise / config.lines;
  const reliefLift = config.relief * RELIEF_SPACINGS * spacing;
  const band = spectrumBand((focusX * frame.width - box.left) / width, config.spread);
  const frameX = (along: number) => (box.left + along * width) / frame.width;
  return lines.map(({ age, levels }) => {
    const baseline = height - spacing / 2 - age * (rise - spacing / 2);
    const frameY = (box.top + baseline) / frame.height;
    const points = Array.from({ length: POINTS }, (_, index) => {
      const along = index / (POINTS - 1);
      const art = field ? heightAt(field, frameX(along), frameY) * reliefLift : 0;
      const music = spectrumLift(levels, along, band) * PEAK_LIFT * height;
      return { x: along * width, y: baseline - art - music };
    });
    const colors = field && config.fill === 'art' ? artColors(field, frameX, frameY) : [];
    return { path: closedBelow(points, box), colors };
  });
}

/** The art's colors along a line's row, one per gradient stop. */
const artColors = (field: ReliefField, frameX: (along: number) => number, frameY: number) =>
  Array.from({ length: STOPS }, (_, stop) => colorAt(field, frameX(stop / (STOPS - 1)), frameY));

/** The line, carried on flat past both sides of the box, closed below it. */
function closedBelow(points: Point[], { width, height }: Size): string {
  const line = [
    { x: -BLEED, y: points[0]!.y },
    ...points,
    { x: width + BLEED, y: points.at(-1)!.y },
  ];
  const bottom = height + BLEED;
  return `${smoothPath(line)} L ${width + BLEED} ${bottom} L ${-BLEED} ${bottom} Z`;
}

interface FieldRequest {
  art: BackgroundArt;
  frame: Size;
}

const fields = new PreparedCache<ReliefField>('ridgeline');

/** The art's relief, read once per image as the frame shows it. */
function useReliefField(art: BackgroundArt | null, frame: Size): ReliefField | null {
  const request = art && { art, frame: { width: frame.width, height: frame.height } };
  return usePrepared(fields, request, fieldKey, prepareField);
}

const fieldKey = ({ art, frame }: FieldRequest) => `${art.src} ${frame.width}x${frame.height}`;

async function prepareField({ art, frame }: FieldRequest): Promise<ReliefField> {
  const scale = FIELD_CELLS / Math.max(frame.width, frame.height);
  const size = { width: Math.round(frame.width * scale), height: Math.round(frame.height * scale) };
  const context = context2d(new OffscreenCanvas(size.width, size.height));
  context.imageSmoothingQuality = 'high';
  context.filter = `blur(${FIELD_BLUR}px)`;
  drawFitted(context, await loadImage(art.src), 'cover', 1);
  return reliefField(context.getImageData(0, 0, size.width, size.height).data, size);
}

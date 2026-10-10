import { z } from 'zod';
import { FEATURE_SOURCES, type AudioAnalyzer, type FeatureSource } from './audio.ts';
import { ANNOTATION_KINDS, SECTION_KINDS } from './mix-schema.ts';
import { clamp } from './motion.ts';
import { beatPhase } from './stage.ts';
import { sinceAnnotation, untilAnnotation, type MixState, type CurrentPlay } from './timeline.ts';

/** Shapes a 0..1 source into a 0..1 amount before `range` maps it onto the target. */
export const CURVES = {
  linear: (amount: number) => amount,
  sqrt: (amount: number) => Math.sqrt(amount),
  pow2: (amount: number) => amount * amount,
  pow3: (amount: number) => amount * amount * amount,
  smooth: (amount: number) => amount * amount * (3 - 2 * amount),
} as const;
export type Curve = keyof typeof CURVES;

/**
 * Event-driven sources. `since:drop` is 1 at the drop and falls to 0 over `window` seconds.
 * `until:drop` is the anticipation: it climbs to 1 as the drop approaches and releases to 0 once
 * the drop lands, where `since:drop` takes over.
 */
export type TimelineSource =
  | `since:${(typeof ANNOTATION_KINDS)[number]}`
  | `until:${(typeof ANNOTATION_KINDS)[number]}`;
export const TIMELINE_SOURCES: TimelineSource[] = ANNOTATION_KINDS.flatMap(
  (type): TimelineSource[] => [`since:${type}`, `until:${type}`],
);

/** Tempo sources: 1 on the beat (or the bar's downbeat), falling to 0 just before the next. 0 without `bpm:`. */
export const BEAT_SOURCES = ['beat', 'bar'] as const;
export type BeatSource = (typeof BEAT_SOURCES)[number];

export type ModSource = FeatureSource | TimelineSource | BeatSource;
const SOURCES = [...FEATURE_SOURCES, ...TIMELINE_SOURCES, ...BEAT_SOURCES] as [
  ModSource,
  ...ModSource[],
];

export const ModRouteSchema = z.strictObject({
  scope: z
    .enum(['mix', 'play'], { error: 'Use mix for stage routes or play for per-panel routes.' })
    .default('mix'),
  source: z.enum(SOURCES, {
    error: (issue) =>
      typeof issue.input === 'string'
        ? `Unknown source "${issue.input}". Audio: bass, mids, highs, rms, onset. Timeline: since:<event> or until:<event>. Tempo: beat, bar.`
        : 'source is required. Audio: bass, mids, highs, rms, onset. Timeline: since:<event> or until:<event>. Tempo: beat, bar.',
  }),
  /** Exposed to CSS as `--mod-<target>`. */
  target: z
    .string({ error: 'Target must be kebab-case (e.g. bg-zoom).' })
    .regex(/^[a-z][a-z0-9-]*$/, {
      error: 'Target must be kebab-case (e.g. bg-zoom); it becomes --mod-<target> in CSS.',
    }),
  /** Output when the source is 0 and when it is 1. */
  range: z
    .tuple(
      [
        z.number({ error: 'range must be two numbers, e.g. [1, 1.06].' }),
        z.number({ error: 'range must be two numbers, e.g. [1, 1.06].' }),
      ],
      { error: 'range must be two numbers, e.g. [1, 1.06].' },
    )
    .default([0, 1]),
  curve: z
    .enum(Object.keys(CURVES) as [Curve, ...Curve[]], {
      error: `curve must be ${Object.keys(CURVES).join(', ')}.`,
    })
    .default('linear'),
  /** Smoothing window in seconds; 0 is instantaneous. Audio sources only. */
  smooth: z
    .number({ error: 'smooth must be from 0 to 2 seconds.' })
    .min(0, { error: 'smooth must be from 0 to 2 seconds.' })
    .max(2, { error: 'smooth must be from 0 to 2 seconds.' })
    .default(0),
  /** Seconds a `since:` / `until:` source ramps over. Audio sources ignore it. */
  window: z
    .number({ error: 'window must be greater than 0 and no more than 60 seconds.' })
    .positive({ error: 'window must be greater than 0 seconds.' })
    .max(60, { error: 'window must be no more than 60 seconds.' })
    .default(1),
  /** Only active during this section; rests at range[0] otherwise. */
  when: z.enum(SECTION_KINDS, { error: `when must be ${SECTION_KINDS.join(', ')}.` }).optional(),
});
export type ModRoute = z.infer<typeof ModRouteSchema>;
/** A route as written: everything but `source` and `target` has a default. */
export type ModRouteInput = z.input<typeof ModRouteSchema>;

/** A modulation patch: the list a theme ships and the list `modulation:` adds to it. */
export const ModPatchSchema = z.array(ModRouteSchema);

export interface ModContext {
  time: number;
  fps: number;
  mix: MixState;
  play?: CurrentPlay;
  analyzer: AudioAnalyzer;
  /** Tempo, or null when the project states none; beat sources are 0 then. */
  bpm: number | null;
  beatOffset: number;
}

/**
 * Resolves every route to a number. Later routes override earlier ones with the same target,
 * which is how a project's routes replace a theme's defaults; an overridden route is not evaluated.
 */
export function evaluateModulation(
  routes: readonly ModRoute[],
  context: ModContext,
): Record<string, number> {
  const byTarget = new Map(
    routes
      .filter((route) => route.scope === (context.play ? 'play' : 'mix'))
      .map((route) => [route.target, route]),
  );
  return Object.fromEntries(
    [...byTarget.values()].map((route) => [route.target, evaluateRoute(route, context)]),
  );
}

export function evaluateRoute(route: ModRoute, context: ModContext): number {
  const [from, to] = route.range;
  const section = context.play ? context.play.section : context.mix.mixSection;
  if (route.when && section?.kind !== route.when) return from;
  const amount = clamp(sourceValue(route, context), 0, 1);
  return from + (to - from) * CURVES[route.curve](amount);
}

const isTimeline = (source: ModSource): source is TimelineSource => source.includes(':');
const isBeat = (source: ModSource): source is BeatSource =>
  (BEAT_SOURCES as readonly string[]).includes(source);

function sourceValue(route: ModRoute, context: ModContext): number {
  const { source } = route;
  if (isBeat(source)) {
    if (!context.bpm) return 0;
    return 1 - beatPhase(context.time, context.bpm, context.beatOffset)[source];
  }
  if (!isTimeline(source)) return smoothedFeature(source, route.smooth, context);

  const [direction, type] = source.split(':') as ['since' | 'until', string];
  const seconds =
    direction === 'since'
      ? sinceAnnotation(
          context.mix,
          type,
          context.play ? { play: context.play.play.id } : undefined,
          context.play?.run,
        )
      : untilAnnotation(
          context.mix,
          type,
          context.play ? { play: context.play.play.id } : undefined,
          context.play?.run,
        );
  return 1 - seconds / route.window;
}

/** Frame-independent smoothing: a recency-weighted average over the trailing window. */
export function smoothedFeature(
  source: FeatureSource,
  seconds: number,
  { time, fps, analyzer }: Pick<ModContext, 'time' | 'fps' | 'analyzer'>,
): number {
  if (seconds <= 0) return analyzer.featuresAt(time)[source];

  const sampleCount = Math.min(8, Math.max(2, Math.ceil(seconds * fps)));
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < sampleCount; i++) {
    const sampleTime = time - (seconds * i) / (sampleCount - 1);
    const weight = sampleCount - i;
    weightedSum += weight * analyzer.featuresAt(Math.max(0, sampleTime))[source];
    totalWeight += weight;
  }
  return weightedSum / totalWeight;
}

/** CSS custom properties for a modulation result: `{ '--mod-bg-zoom': '1.04' }`. */
export const modulationVars = (values: Record<string, number>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(values).map(([target, value]) => [`--mod-${target}`, String(round(value))]),
  );

const round = (value: number) => Math.round(value * 10000) / 10000;

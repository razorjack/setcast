import { z } from 'zod';
import { FEATURE_SOURCES, type AudioAnalyzer, type FeatureSource } from './audio.ts';
import { EVENT_TYPES, SECTION_TYPES, type EventType, type SectionType } from './events.ts';
import { clamp } from './motion.ts';
import { beatPhase } from './stage.ts';
import { since, until, type EventState } from './timeline.ts';

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
export type TimelineSource = `since:${EventType}` | `until:${EventType}`;
export const TIMELINE_SOURCES: TimelineSource[] = EVENT_TYPES.flatMap((type): TimelineSource[] => [
  `since:${type}`,
  `until:${type}`,
]);

/** Tempo sources: 1 on the beat (or the bar's downbeat), falling to 0 just before the next. 0 without `bpm:`. */
export const BEAT_SOURCES = ['beat', 'bar'] as const;
export type BeatSource = (typeof BEAT_SOURCES)[number];

export type ModSource = FeatureSource | TimelineSource | BeatSource;
const SOURCES = [...FEATURE_SOURCES, ...TIMELINE_SOURCES, ...BEAT_SOURCES] as [
  ModSource,
  ...ModSource[],
];

export const ModRouteSchema = z.strictObject({
  source: z.enum(SOURCES),
  /** Exposed to CSS as `--mod-<target>`. */
  target: z
    .string()
    .regex(
      /^[a-z][a-z0-9-]*$/,
      'Target must be kebab-case (e.g. bg-zoom); it becomes --mod-<target> in CSS.',
    ),
  /** Output when the source is 0 and when it is 1. */
  range: z.tuple([z.number(), z.number()]).default([0, 1]),
  curve: z.enum(Object.keys(CURVES) as [Curve, ...Curve[]]).default('linear'),
  /** Smoothing window in seconds; 0 is instantaneous. Audio sources only. */
  smooth: z.number().min(0).max(2).default(0),
  /** Seconds a `since:` / `until:` source ramps over. Audio sources ignore it. */
  window: z.number().positive().max(60).default(1),
  /** Only active during this section; rests at range[0] otherwise. */
  when: z.enum(SECTION_TYPES).optional(),
});
export type ModRoute = z.infer<typeof ModRouteSchema>;
/** A route as written: everything but `source` and `target` has a default. */
export type ModRouteInput = z.input<typeof ModRouteSchema>;

/** A modulation patch: the list a theme ships and the list `modulation:` adds to it. */
export const ModPatchSchema = z.array(ModRouteSchema);

export interface ModContext {
  time: number;
  fps: number;
  events: EventState;
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
  const byTarget = new Map(routes.map((route) => [route.target, route]));
  return Object.fromEntries(
    [...byTarget.values()].map((route) => [route.target, evaluateRoute(route, context)]),
  );
}

export function evaluateRoute(route: ModRoute, context: ModContext): number {
  const [from, to] = route.range;
  if (route.when && !inSection(context.events.section, route.when)) return from;
  const amount = clamp(sourceValue(route, context), 0, 1);
  return from + (to - from) * CURVES[route.curve](amount);
}

/** `when: drop` covers double drops, as `since:drop` and `--since-drop` do. */
const inSection = (section: SectionType | null, when: SectionType) =>
  section === when || (when === 'drop' && section === 'double_drop');

const isTimeline = (source: ModSource): source is TimelineSource => source.includes(':');
const isBeat = (source: ModSource): source is BeatSource =>
  (BEAT_SOURCES as readonly string[]).includes(source);

function sourceValue(route: ModRoute, context: ModContext): number {
  const { source } = route;
  if (isBeat(source)) {
    if (!context.bpm) return 0;
    return 1 - beatPhase(context.time, context.bpm, context.beatOffset)[source];
  }
  if (!isTimeline(source)) return smoothed(source, route.smooth, context);

  const [direction, type] = source.split(':') as ['since' | 'until', EventType];
  const seconds =
    direction === 'since'
      ? since(context.events, type, context.time)
      : until(context.events, type, context.time);
  return 1 - seconds / route.window;
}

/** Frame-independent smoothing: a recency-weighted average over the trailing window. */
function smoothed(
  source: FeatureSource,
  seconds: number,
  { time, fps, analyzer }: ModContext,
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

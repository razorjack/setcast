import { z } from 'zod';
import { FEATURE_SOURCES, type AudioAnalyzer } from './audio.ts';
import { SECTION_TYPES, type SectionType } from './events.ts';
import { clamp } from './motion.ts';

export const CURVES = {
  linear: (v: number) => v,
  sqrt: (v: number) => Math.sqrt(v),
  pow2: (v: number) => v * v,
  pow3: (v: number) => v * v * v,
  smooth: (v: number) => v * v * (3 - 2 * v),
} as const;
export type Curve = keyof typeof CURVES;

export const ModRouteSchema = z.object({
  source: z.enum(FEATURE_SOURCES),
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
  /** Smoothing window in seconds; 0 is instantaneous. */
  smooth: z.number().min(0).max(2).default(0),
  /** Only active during this section; rests at range[0] otherwise. */
  when: z.enum(SECTION_TYPES).optional(),
});
export type ModRoute = z.infer<typeof ModRouteSchema>;

export interface ModContext {
  time: number;
  fps: number;
  section: SectionType | null;
  analyzer: AudioAnalyzer;
}

/**
 * Resolves every route to a number. Later routes override earlier ones with the same target,
 * which is how a project's routes replace a theme's defaults.
 */
export function evaluateModulation(
  routes: readonly ModRoute[],
  ctx: ModContext,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const route of routes) out[route.target] = evaluateRoute(route, ctx);
  return out;
}

export function evaluateRoute(route: ModRoute, ctx: ModContext): number {
  const [from, to] = route.range;
  if (route.when && ctx.section !== route.when) return from;
  const v = clamp(smoothedSource(route, ctx), 0, 1);
  return from + (to - from) * CURVES[route.curve](v);
}

/** Frame-independent smoothing: a recency-weighted average over the trailing window. */
function smoothedSource(route: ModRoute, { time, fps, analyzer }: ModContext): number {
  if (route.smooth <= 0) return analyzer.featuresAt(time)[route.source];
  const samples = Math.min(8, Math.max(2, Math.ceil(route.smooth * fps)));
  let sum = 0;
  let weights = 0;
  for (let i = 0; i < samples; i++) {
    const t = time - (route.smooth * i) / (samples - 1);
    const w = samples - i;
    sum += w * analyzer.featuresAt(Math.max(0, t))[route.source];
    weights += w;
  }
  return sum / weights;
}

/** CSS custom properties for a modulation result: `{ '--mod-bg-zoom': '1.04' }`. */
export const modulationVars = (values: Record<string, number>): Record<string, string> =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [`--mod-${k}`, String(round(v))]));

const round = (v: number) => Math.round(v * 10000) / 10000;

export type Easing = (t: number) => number;

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const ease = {
  linear: ((t) => t) as Easing,
  in: ((t) => t * t * t) as Easing,
  out: ((t) => 1 - (1 - t) ** 3) as Easing,
  inOut: ((t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)) as Easing,
  expoOut: ((t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))) as Easing,
  expoIn: ((t) => (t <= 0 ? 0 : 2 ** (10 * t - 10))) as Easing,
};

export interface InterpolateOptions {
  easing?: Easing;
  /** `clamp` (default) holds the edge values; `extend` keeps extrapolating linearly. */
  extrapolate?: 'clamp' | 'extend';
}

/**
 * Maps `input` from `[in0, in1]` to `[out0, out1]`. With more than two stops, the input range
 * is treated as a piecewise-linear curve; `easing` applies per segment.
 */
export function interpolate(
  input: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
  { easing = ease.linear, extrapolate = 'clamp' }: InterpolateOptions = {},
): number {
  if (inputRange.length < 2 || inputRange.length !== outputRange.length) {
    throw new RangeError(
      `interpolate: inputRange and outputRange need the same length (>= 2), got ${inputRange.length} and ${outputRange.length}.`,
    );
  }
  const first = inputRange[0]!;
  const last = inputRange[inputRange.length - 1]!;
  if (extrapolate === 'clamp') input = clamp(input, first, last);

  let i = 0;
  while (i < inputRange.length - 2 && input > inputRange[i + 1]!) i++;
  const in0 = inputRange[i]!;
  const in1 = inputRange[i + 1]!;
  const out0 = outputRange[i]!;
  const out1 = outputRange[i + 1]!;
  if (in1 === in0) return out1;
  const t = (input - in0) / (in1 - in0);
  return lerp(out0, out1, t >= 0 && t <= 1 ? easing(t) : t);
}

export interface SpringConfig {
  stiffness?: number;
  damping?: number;
  mass?: number;
}

/**
 * Closed-form damped spring from 0 to 1 at time `t` (seconds): the position of a mass released
 * at rest one unit away from equilibrium. Deterministic and frame-independent by construction.
 */
export function spring(t: number, { stiffness = 120, damping = 14, mass = 1 }: SpringConfig = {}) {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  let x: number;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    x = Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  } else if (zeta === 1) {
    x = Math.exp(-w0 * t) * (1 + w0 * t);
  } else {
    const s = w0 * Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta * w0 + s;
    const r2 = -zeta * w0 - s;
    x = (r1 * Math.exp(r2 * t) - r2 * Math.exp(r1 * t)) / (r1 - r2);
  }
  return 1 - x;
}

/** 1 at `t = 0`, decaying to ~0 over `seconds`; 0 before `t = 0`. Good for hit/drop impacts. */
export const impulse = (t: number, seconds: number): number =>
  t < 0 || seconds <= 0 ? 0 : Math.exp((-5 * t) / seconds);

/** Smoothstep from 0 at `t = 0` to 1 at `t = seconds`. */
export const rampUp = (t: number, seconds: number): number => {
  const x = clamp(seconds <= 0 ? 1 : t / seconds, 0, 1);
  return x * x * (3 - 2 * x);
};

export type Easing = (t: number) => number;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

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
  let segment = 0;
  while (segment < inputRange.length - 2 && input > inputRange[segment + 1]!) segment++;
  const inFrom = inputRange[segment]!;
  const inTo = inputRange[segment + 1]!;
  const outFrom = outputRange[segment]!;
  const outTo = outputRange[segment + 1]!;
  if (inTo === inFrom) return input < inFrom ? outFrom : outTo;

  const at = extrapolate === 'clamp' ? clamp(input, inFrom, inTo) : input;
  const t = (at - inFrom) / (inTo - inFrom);
  // Easing is defined on the segment, so an extrapolated t passes through untouched.
  return lerp(outFrom, outTo, t >= 0 && t <= 1 ? easing(t) : t);
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
  const naturalFrequency = Math.sqrt(stiffness / mass);
  const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));
  return 1 - displacement(t, naturalFrequency, dampingRatio);
}

/**
 * How far the mass still is from equilibrium at `t`, for natural frequency `w0` and damping ratio
 * `zeta`: the three standard closed forms of a damped oscillator, under, critically and over.
 */
function displacement(t: number, w0: number, zeta: number): number {
  if (zeta < 1) {
    const damped = w0 * Math.sqrt(1 - zeta * zeta);
    const shape = Math.cos(damped * t) + ((zeta * w0) / damped) * Math.sin(damped * t);
    return Math.exp(-zeta * w0 * t) * shape;
  }
  if (zeta === 1) return Math.exp(-w0 * t) * (1 + w0 * t);

  const spread = w0 * Math.sqrt(zeta * zeta - 1);
  const slow = -zeta * w0 + spread;
  const fast = -zeta * w0 - spread;
  return (slow * Math.exp(fast * t) - fast * Math.exp(slow * t)) / (slow - fast);
}

/** 1 at `t = 0`, decaying to ~0 over `seconds`; 0 before `t = 0`. Good for hit/drop impacts. */
export const impulse = (t: number, seconds: number): number =>
  t < 0 || seconds <= 0 ? 0 : Math.exp((-5 * t) / seconds);

/** Smoothstep from 0 at `t = 0` to 1 at `t = seconds`. */
export const rampUp = (t: number, seconds: number): number => {
  const progress = clamp(seconds <= 0 ? 1 : t / seconds, 0, 1);
  return progress * progress * (3 - 2 * progress);
};

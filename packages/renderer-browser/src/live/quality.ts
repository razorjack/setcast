export interface QualityState {
  scale: number;
  slow: number;
  steady: number;
}

export const fullQuality = (): QualityState => ({ scale: 1, slow: 0, steady: 0 });

/** Called once per diagnostics sample (roughly one second), never from the capture clock. */
export function adaptQuality(
  state: QualityState,
  fps: number,
  target: number,
  active: boolean,
): QualityState {
  if (!active) return { ...state, slow: 0, steady: 0 };
  const slow = fps < target * 0.8 ? state.slow + 1 : 0;
  const steady = fps >= target * 0.95 ? state.steady + 1 : 0;
  if (slow >= 3) return { scale: Math.max(0.25, state.scale / 2), slow: 0, steady: 0 };
  if (steady >= 15) return { scale: Math.min(1, state.scale * 2), slow: 0, steady: 0 };
  return { ...state, slow, steady };
}

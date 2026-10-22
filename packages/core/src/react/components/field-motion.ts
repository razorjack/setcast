/** Bounded phases avoid losing sub-frame precision in long sessions on the GPU. */
export function fieldPhases(timeSeconds: number, speed: number, seed: number): number[] {
  let state = seed >>> 0;
  return [0.17, 0.13, 0.11, 0.07].map((rate) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const offset = (state / 4294967296) * Math.PI * 2;
    return (timeSeconds * speed * rate + offset) % (Math.PI * 2);
  });
}

export function fieldSize(width: number, height: number, resolution: number, limit: number) {
  const ratio = Math.min(resolution, limit / Math.max(width, height, 1));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

/*
 * Shaders receive time only as phases reduced here, in double precision: a GPU float holding
 * hours of seconds cannot resolve a frame.
 */

const TAU = Math.PI * 2;

/** Numbers in [0, 1) derived from the seed alone, the same sequence for every caller. */
function seededUnits(seed: number, count: number): number[] {
  let state = seed >>> 0;
  return Array.from({ length: count }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  });
}

/** Bounded phases avoid losing sub-frame precision in long sessions on the GPU. */
export function fieldPhases(timeSeconds: number, speed: number, seed: number): number[] {
  const offsets = seededUnits(seed, 4);
  return [0.17, 0.13, 0.11, 0.07].map(
    (rate, index) => (timeSeconds * speed * rate + offsets[index]! * TAU) % TAU,
  );
}

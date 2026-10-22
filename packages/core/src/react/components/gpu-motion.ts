/*
 * Shaders receive time only as phases reduced here, in double precision: a GPU float holding
 * hours of seconds cannot resolve a frame, so every motion wraps at a period the shader shares.
 */

const TAU = Math.PI * 2;

/** Ring identities in the tunnel shader repeat after this many rings. */
export const TUNNEL_RING_PERIOD = 64;

/** Numbers in [0, 1) derived from the seed alone, the same sequence for every caller. */
function seededUnits(seed: number, count: number): number[] {
  let state = seed >>> 0;
  return Array.from({ length: count }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  });
}

/** `value` modulo `period`, in [0, period) also for negative values. */
const wrap = (value: number, period: number) => ((value % period) + period) % period;

/** Bounded phases avoid losing sub-frame precision in long sessions on the GPU. */
export function fieldPhases(timeSeconds: number, speed: number, seed: number): number[] {
  const offsets = seededUnits(seed, 4);
  return [0.17, 0.13, 0.11, 0.07].map(
    (rate, index) => (timeSeconds * speed * rate + offsets[index]! * TAU) % TAU,
  );
}

/** `[travel, spin]`: travel in rings, spin in radians. */
export function tunnelMotion(
  timeSeconds: number,
  config: { seed: number; speed: number; rings: number; spin: number },
): number[] {
  const [travelOffset, spinOffset] = seededUnits(config.seed, 2) as [number, number];
  const rings = timeSeconds * config.speed * config.rings + travelOffset * TUNNEL_RING_PERIOD;
  const turn = (timeSeconds * config.spin * Math.PI) / 180 + spinOffset * TAU;
  return [wrap(rings, TUNNEL_RING_PERIOD), wrap(turn, TAU)];
}

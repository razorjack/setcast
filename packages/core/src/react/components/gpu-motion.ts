/*
 * Shaders receive time only as phases reduced here, in double precision: a GPU float holding
 * hours of seconds cannot resolve a frame, so every motion wraps at a period the shader shares.
 */

const TAU = Math.PI * 2;

/** Ring identities in the tunnel shader repeat after this many rings. */
export const TUNNEL_RING_PERIOD = 64;

/** Cell identities in the constellation shader repeat after this many cells on each axis. */
export const CONSTELLATION_CELL_PERIOD = 256;

/** Parallax layers in the constellation shader. */
export const CONSTELLATION_LAYERS = 3;

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

export interface ConstellationMotion {
  /** Orbit and twinkle phases in radians. */
  phases: number[];
  /** How near each layer is, 0 far to 1 near. */
  depths: number[];
  /** A distinct identity for each pass of each layer, so a returning layer brings new points. */
  layers: number[];
  /** Drift of the point grid in cells, wrapped at `CONSTELLATION_CELL_PERIOD`. */
  drift: number[];
}

export function constellationMotion(
  timeSeconds: number,
  config: { seed: number; speed: number },
): ConstellationMotion {
  const [flightOffset, heading, ...offsets] = seededUnits(config.seed, 6) as number[];
  const travel = timeSeconds * config.speed;
  const phases = [0.9, 0.67, 2.3, 0.41].map((rate, index) =>
    wrap(travel * rate + offsets[index]! * TAU, TAU),
  );
  const flight = travel * 0.12 + flightOffset!;
  const depths: number[] = [];
  const layers: number[] = [];
  for (let layer = 0; layer < CONSTELLATION_LAYERS; layer++) {
    const position = flight + layer / CONSTELLATION_LAYERS;
    depths.push(position - Math.floor(position));
    layers.push((Math.floor(position) * CONSTELLATION_LAYERS + layer) >>> 0);
  }
  const angle = heading! * TAU;
  const drift = [Math.cos(angle), Math.sin(angle)].map((direction) =>
    wrap(travel * 0.35 * direction, CONSTELLATION_CELL_PERIOD),
  );
  return { phases, depths, layers, drift };
}

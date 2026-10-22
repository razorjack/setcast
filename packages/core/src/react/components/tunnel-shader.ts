import { TUNNEL_RING_PERIOD } from './gpu-motion.ts';
import { glslHash } from './shader-gl.ts';

export const tunnelFragment = `#version 300 es
precision highp float;
uniform vec2 u_size;
uniform vec4 u_color;
uniform vec2 u_motion;
uniform vec3 u_audio;
uniform vec4 u_shape;
uniform uint u_seed;
out vec4 fragment;

const float TAU = 6.28318530718;
const float RING_PERIOD = ${TUNNEL_RING_PERIOD}.0;
${glslHash}

/** Coverage of a line of half-width w at distance d, both in units whose pixel size is px. */
float line(float d, float w, float px) {
  float core = 1.0 - smoothstep(w, w + px, d);
  return core * min(1.0, 2.0 * w / px);
}

/** Lines closer than a few pixels apart would alias into moire; they fade out instead. */
float resolvable(float px) {
  return 1.0 - smoothstep(0.18, 0.45, px);
}

void main() {
  vec2 point = (2.0 * gl_FragCoord.xy - u_size) / min(u_size.x, u_size.y);
  float radius = max(length(point), 1e-4);
  float sides = u_shape.x;
  float rings = u_shape.y;
  float spokes = u_shape.z;
  float twist = u_shape.w;
  // Twist turns the walls by twist turns per depth unit, with depth approximated by 1 / radius.
  float angle = atan(point.y, point.x) + u_motion.y + twist * TAU / radius;
  float sector = sides >= 3.0 ? TAU / sides : TAU;

  float wall = radius;
  if (sides >= 3.0) wall *= cos(mod(angle + 0.5 * sector, sector) - 0.5 * sector);
  wall *= 1.0 + 0.12 * u_audio.x;
  float depth = 1.0 / wall;
  float fog = exp(-0.32 * depth) * smoothstep(0.0, 0.25, radius);

  float along = depth * rings + u_motion.x;
  float alongPx = fwidth(along);
  float ringDistance = abs(fract(along + 0.5) - 0.5);
  uint ring = uint(mod(floor(along + 0.5), RING_PERIOD));
  float accent = unit(hash(uvec3(ring, 7u, u_seed)).x);
  float ringWidth = (0.035 + 0.07 * u_audio.x) * (accent > 0.8 ? 1.8 : 1.0);
  float ringLight = line(ringDistance, ringWidth, alongPx) * resolvable(alongPx)
    * (0.3 + 0.7 * accent * accent) * (0.4 + 0.5 * u_audio.x + 0.1 * u_audio.z);

  float detail = line(abs(fract(along) - 0.5), 0.012, alongPx) * resolvable(2.0 * alongPx)
    * 0.55 * u_audio.z;

  float light = ringLight + detail;
  if (spokes > 0.0) {
    // fwidth(angle) would jump where atan wraps, so its derivatives are taken analytically.
    vec2 turn = vec2(-point.y, point.x) / (radius * radius);
    vec2 inward = -point / (radius * radius * radius);
    vec2 dx = dFdx(point);
    vec2 dy = dFdy(point);
    vec2 dAngle = vec2(dot(turn + twist * TAU * inward, dx), dot(turn + twist * TAU * inward, dy));
    float aroundPx = spokes / TAU * (abs(dAngle.x) + abs(dAngle.y));
    // Spokes start at a polygon's corners.
    float around = spokes * (angle - 0.5 * sector) / TAU;
    float spokeDistance = abs(fract(around + 0.5) - 0.5);
    light += line(spokeDistance, 0.025, aroundPx) * resolvable(aroundPx)
      * (0.16 + 0.3 * u_audio.y);

    uint column = uint(mod(floor(around), spokes));
    uint row = uint(mod(floor(along), RING_PERIOD));
    float panel = unit(hash(uvec3(row, column, u_seed ^ 0x9e3779b9u)).y);
    float threshold = 0.9 - 0.22 * u_audio.y;
    light += smoothstep(threshold, threshold + 0.04, panel) * (0.08 + 0.2 * u_audio.y)
      * resolvable(max(alongPx, aroundPx));
  }

  float alpha = clamp(light * fog, 0.0, 1.0) * u_color.a;
  fragment = vec4(u_color.rgb * alpha, alpha);
}
`;

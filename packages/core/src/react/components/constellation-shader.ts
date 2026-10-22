import { CONSTELLATION_CELL_PERIOD, CONSTELLATION_LAYERS } from './gpu-motion.ts';
import { glslHash } from './shader-gl.ts';

/*
 * Each layer is a grid with one point per cell, kept inside its cell, linked to the points of
 * the eight cells around it. A link lies within the 2x2 block of cells around its two ends, so
 * the links that can cross a pixel are the twelve pairs in its 3x3 neighborhood whose block
 * contains the pixel's own cell (`LINKS`, indices into `stars` by row). No link is cut off at a
 * cell boundary.
 */
export const constellationFragment = `#version 300 es
precision highp float;
uniform vec2 u_size;
uniform vec4 u_color;
uniform vec4 u_phase;
uniform vec3 u_audio;
uniform vec3 u_depths;
uniform uvec3 u_layers;
uniform vec2 u_drift;
uniform float u_density;
uniform float u_links;
uniform uint u_seed;
out vec4 fragment;

const float TAU = 6.28318530718;
const float CELL_PERIOD = ${CONSTELLATION_CELL_PERIOD}.0;
${glslHash}

const ivec2 LINKS[12] = ivec2[12](
  ivec2(3, 4), ivec2(4, 5), ivec2(1, 4), ivec2(4, 7),
  ivec2(0, 4), ivec2(1, 5), ivec2(3, 7), ivec2(4, 8),
  ivec2(3, 1), ivec2(4, 2), ivec2(6, 4), ivec2(7, 5)
);

struct Star {
  vec2 position;
  float brightness;
  float size;
};

Star star(vec2 cell, uint layer) {
  uvec2 wrapped = uvec2(mod(cell, CELL_PERIOD));
  uvec3 bits = hash(uvec3(wrapped.x + wrapped.y * ${CONSTELLATION_CELL_PERIOD}u, layer, u_seed));
  uvec3 more = hash(bits);
  vec2 base = 0.2 + 0.6 * vec2(unit(bits.x), unit(bits.y));
  vec2 rate = vec2(1u + more.x % 3u, 1u + more.y % 3u);
  vec2 offset = TAU * vec2(unit(bits.z), unit(more.z));
  vec2 orbit = 0.18 * sin(rate * u_phase.xy + offset);
  float twinkle = 0.5 + 0.5 * sin(float(1u + more.x % 4u) * u_phase.z + offset.y);
  float shine = (0.45 + 0.55 * unit(more.y)) * (1.0 - (0.15 + 0.55 * u_audio.z) * twinkle);
  float size = unit(more.z) > 0.92 ? 1.8 : 1.0;
  return Star(cell + base + orbit, shine, size);
}

float segment(vec2 point, vec2 from, vec2 to) {
  vec2 along = to - from;
  float t = clamp(dot(point - from, along) / dot(along, along), 0.0, 1.0);
  return length(point - from - along * t);
}

float layerLight(vec2 screen, float depth, uint layer) {
  float fade = smoothstep(0.0, 0.3, depth) * (1.0 - smoothstep(0.75, 1.0, depth));
  if (fade <= 0.0) return 0.0;
  float zoom = mix(2.6, 0.45, depth) * (1.0 - 0.06 * u_audio.x);
  vec2 shift = vec2(unit(hash(uvec3(layer, u_seed, 3u)).x), unit(hash(uvec3(layer, u_seed, 5u)).x));
  vec2 point = screen * 0.5 * u_density * zoom + u_drift + shift * CELL_PERIOD;
  float px = fwidth(point.x);
  vec2 cell = floor(point);

  Star stars[9];
  for (int index = 0; index < 9; index++) {
    stars[index] = star(cell + vec2(index % 3 - 1, index / 3 - 1), layer);
  }

  float light = 0.0;
  for (int index = 0; index < 9; index++) {
    Star current = stars[index];
    float radius = 0.035 * current.size * (1.0 + 0.9 * u_audio.x);
    float drawn = max(radius, px);
    float d = length(point - current.position);
    float core = (1.0 - smoothstep(drawn - px, drawn + px, d)) * min(1.0, radius / px);
    float halo = exp(-d / (2.5 * radius)) * (1.0 - smoothstep(0.6, 1.0, d))
      * 0.22 * (0.4 + 0.6 * u_audio.x);
    light += (core + halo) * current.brightness;
  }

  if (u_links > 0.0) {
    float reach = u_links * (0.8 + 0.45 * u_audio.y);
    float width = 0.006;
    float cover = min(1.0, 2.0 * width / px);
    for (int index = 0; index < 12; index++) {
      Star a = stars[LINKS[index].x];
      Star b = stars[LINKS[index].y];
      float span = length(b.position - a.position);
      float strength = 1.0 - smoothstep(0.55 * reach, reach, span);
      if (strength <= 0.0) continue;
      float d = segment(point, a.position, b.position);
      float stroke = (1.0 - smoothstep(width, width + px, d)) * cover;
      light += stroke * strength * min(a.brightness, b.brightness) * (0.3 + 0.35 * u_audio.y);
    }
  }

  return light * fade * mix(0.45, 1.0, depth);
}

void main() {
  vec2 screen = (2.0 * gl_FragCoord.xy - u_size) / min(u_size.x, u_size.y);
  float light = 0.0;
  for (int layer = 0; layer < ${CONSTELLATION_LAYERS}; layer++) {
    light += layerLight(screen, u_depths[layer], u_layers[layer]);
  }
  float alpha = clamp(light, 0.0, 1.0) * u_color.a;
  fragment = vec4(u_color.rgb * alpha, alpha);
}
`;

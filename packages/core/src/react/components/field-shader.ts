export const fieldFragment = `#version 300 es
precision highp float;
uniform vec2 u_size;
uniform vec4 u_phase;
uniform vec3 u_audio;
uniform vec4 u_color;
uniform float u_scale;
out vec4 fragment;

void main() {
  vec2 point = (2.0 * gl_FragCoord.xy - u_size) / min(u_size.x, u_size.y);
  point *= u_scale;
  vec2 drift = vec2(cos(u_phase.x), sin(u_phase.y));
  vec2 bend = vec2(
    sin(point.y * 1.3 + sin(u_phase.z)),
    cos(point.x * 1.1 + cos(u_phase.w))
  );
  point += 0.55 * bend + 0.6 * drift;
  float field = sin(point.x * 1.6 + sin(u_phase.y))
    + 0.65 * cos(point.y * 1.8 + cos(u_phase.x))
    + 0.35 * sin((point.x + point.y) * 1.2 + sin(u_phase.w));
  float contour = abs(sin(field * 3.0 + 0.45 * sin(u_phase.z)));
  float width = 0.045 + 0.075 * u_audio.x;
  float edge = max(fwidth(contour), 0.002);
  float core = 1.0 - smoothstep(width, width + edge, contour);
  float halo = exp(-contour * 5.0) * (0.12 + 0.18 * u_audio.y);
  float light = core * (0.28 + 0.5 * u_audio.x + 0.12 * u_audio.z) + halo;
  float alpha = clamp(light, 0.0, 1.0) * u_color.a;
  fragment = vec4(u_color.rgb * alpha, alpha);
}
`;

# Deterministic GPU visualizers

Three visualizers draw with WebGL 2: `field` (flowing contours), `tunnel` (a perspective tunnel
of rings and spokes) and `constellation` (linked points flying toward the viewer). They work in
live input, recorded playback, Remotion export and browser export. They are opt-in; renderer
defaults and existing themes are unchanged.

```yaml
visualizer:
  name: field
  seed: 42
  speed: 0.3
  scale: 1
  gain: 1
  resolution: 0.5
  recoverySeconds: 5
```

Use these blocks in `setcast.yaml` or `live.yaml`. Each has a runnable live preset:

```sh
node packages/cli/bin/setcast.js live examples/live-field
node packages/cli/bin/setcast.js live examples/live-tunnel          # rave projection
node packages/cli/bin/setcast.js live examples/live-constellation   # filmed backdrop
```

The presets have no credits or clock and a dark background. Start input and select your mixer
channels as usual. Performance intensity scales their audio response; brightness and blackout
still apply to the entire output.

## Shared controls

- `seed`: integer from 0 to 4294967295, default 1. Selects the arrangement without runtime randomness.
- `speed`: 0 to 2. Scales motion. Zero freezes motion but keeps the audio response.
- `gain`: 0.1 to 4, default 1. Scales bass, mids and highs before clamping each to full strength.
- `resolution`: 0.25 to 1, default 0.5. Drawing-buffer pixels per composition pixel. Half resolution
  uses one quarter of the full-resolution pixels. The longest side is capped at 4096 pixels or
  the hardware limit, whichever is smaller. Live adaptive resolution scales this further under
  sustained overload.
- `recoverySeconds`: 0 to 15, default 5. Maximum wall-clock wait for the browser to restore a lost
  graphics context. Zero fails immediately. This is resource readiness, not animation time.

## field

- `speed`: default 0.3. Scales slow contour motion.
- `scale`: 0.5 to 4, default 1. Higher values fit more contours in the same box.

Bass widens and brightens contours, mids strengthen their halos, and highs add restrained
brightness. Motion continues quietly during silence.

## tunnel

```yaml
visualizer: { name: tunnel, sides: 6, rings: 6, spokes: 12, twist: 0, spin: 3 }
```

- `speed`: default 0.25. Depth units travelled per second; each depth unit holds `rings` rings.
- `sides`: 0 for round rings, or 3 to 12 for a regular polygon. Default 6.
- `rings`: 2 to 24 rings per depth unit, default 6.
- `spokes`: 0 to 48 lines along the walls, default 12. On polygons they start at the corners.
- `twist`: -1 to 1, default 0. Turns the walls make per depth unit, for a vortex.
- `spin`: -90 to 90 degrees per second, default 3.

The tunnel fills the frame with large geometry for projection. Bass breathes the depth and
widens the rings, mids light seeded wall panels and the spokes, and highs add fine rings
between the main ones. A few seeded rings are bolder than the rest, so the walls are not a
regular grating. The center fades into fog; rings closer together than a few pixels fade out
instead of aliasing. For a round vortex, try `sides: 0`, `twist: 0.12` and `spokes: 24`.

## constellation

```yaml
visualizer: { name: constellation, density: 6, links: 1, speed: 0.2 }
```

- `speed`: default 0.3. Scales drift, orbits, twinkle and the flight toward the viewer together.
- `density`: 3 to 24, default 7. Points across the short side of the frame at mid depth, per layer.
- `links`: 0 to 1.5, default 1. How far links reach, in point spacings; 0 draws points only.

Three layers of points drift in one seeded direction and fly toward the viewer: a layer appears
in the distance, grows as it approaches and fades before it gets large, then returns far away
with new points. Each point circles slowly inside its own cell. Bass swells the points and
their glow, mids lengthen the links and highs make the points twinkle. The preset masks a
quiet ellipse behind the performer with CSS.

## Appearance

Each canvas fills the stage by default, is transparent between its lines and takes its color
from the theme accent. Override `.sc-field`, `.sc-tunnel` or `.sc-constellation` with ordinary
CSS:

```css
.sc-tunnel {
  color: oklch(75% 0.13 185);
  opacity: 0.8;
  mask-image: radial-gradient(ellipse 25% 40% at 50% 55%, transparent 40%, black);
}
```

CSS controls placement, tint, opacity, blending and masks. Use explicit width and height when
resizing a canvas. Its internal resolution ignores display pixel density and player zoom,
so moving the player between displays does not change the shader's sampling policy. Put a GPU
visualizer first in a visualizer list when other visualizers should draw over it.

## Frame contract and failures

Each shader is a direct function of coordinates, seeded time phases, current audio features,
configuration and CSS color. Each layout effect overwrites the complete drawing buffer. There
is no animation loop, feedback texture, wall clock or previous-frame state, so any frame can be
rendered in any order. Time is reduced in JavaScript to bounded phases before conversion to GPU
floats: the tunnel's travel wraps after 64 rings and the constellation's drift after 256 cells,
matching the period of the shader's ring and cell identities, so long sessions keep sub-frame
movement without a seam. Per-ring, per-panel and per-point randomness comes from integer
hashing, which is exact on every GPU.

The drawing buffer persists while the renderer waits for fonts, artwork and other readiness
holds. This uses WebGL's `preserveDrawingBuffer` option, which can have a performance cost.
See the [WebGL specification](https://registry.khronos.org/webgl/specs/latest/1.0/).

A lost context starts a bounded recovery wait. If the browser restores it, the canvas rebuilds
its program and uniform locations, then draws the latest explicit frame before releasing its
readiness hold. Remotion and the browser exporter wait for that frame. Live audio capture and
scene time continue; the affected canvas can be empty during recovery while other scene layers
continue. The live operator receives private loss/restoration notices. Recovery does not recall
a scene, restart capture, change the journal or appear as text on the projected output.

The timeout starts at loss and is not extended by later setting changes. Missing WebGL 2,
compilation failure, unsuccessful restoration and expired recovery waits produce explicit errors
naming the visualizer. Setcast cannot force a driver to recover and does not substitute another
effect. If recovery fails, reload the player or retry the export. Enable browser graphics
acceleration, try another supported `output.gl` backend, reduce resolution or capture concurrency,
or select an SVG visualizer. A disconnected canvas releases its pending hold and timer.

The same inputs reproduce pixels on the tested browser and graphics backend. Bit-identical
output across GPU vendors, drivers or Chromium versions is not promised: floating-point
trigonometry and blending can differ. Preserve the renderer environment when comparing exact
images.

## Qualification

```sh
node packages/renderer-browser/bench/gpu.ts            # all three; or add field, tunnel or constellation
node packages/renderer-browser/bench/output.ts         # live adaptive resolution
node packages/renderer-remotion/bench/gpu-recovery.ts  # forced loss through Remotion readiness
vp run export-acceptance
vp run export-acceptance --adapter ./packages/renderer-browser/src/export/index.ts --out examples/demo/out/browser-acceptance
```

For each visualizer, the browser check exercises backward and shuffled frame requests, fresh
concurrent capture pages, seed changes, audio response with stopped motion, CSS colors and
resizing, portrait output, repeated scene remounts, unavailable WebGL, repeated context restoration,
fail-fast policy, timeout failure and scene replacement during recovery. Restored frames match the
requested reference pixels. SwiftShader checks request-order independence and restored pixels.
Synthetic live input continues with all three contexts lost together, recovers them without dropped
analysis samples, then restarts capture. The projection check restores a context inside the warped
iframe and verifies private operator notices. The Remotion check forces loss during the first draw,
compares restored still pixels and verifies timeout failure. The output check verifies that live adaptive
resolution scales all three drawing buffers and restores them. Images and timings are saved
under `examples/demo/out/gpu-check/`.

Both exporter acceptance suites check repeated stills and compare every decoded frame from
one-worker and two-worker exports with one-second chunks, for each GPU visualizer. Those
comparisons stay within each adapter, since the adapters use different Chromium runtimes.

The capture benchmark compares 60 warmed 1080p frame requests and JPEG-95 screenshots per
configuration. It includes browser scheduling, readiness and screenshot work and excludes
bundling, initial shader compilation and video encoding. On the local Apple M1 Pro (ANGLE
Metal, Chromium 156.0.8078.4, Node 26.7.0), removing offline display pacing increased the
short capture benchmark from its earlier 19.9–20.0 frames/s to 29.8–32.3 for the GPU visuals,
28.3 for spectrum and 33.5 for radial. Mean screenshot time was 28.6–30.6 ms for the GPU
visualizers and 27.0–27.3 ms for SVG. These are capture rates, not isolated GPU speed or live
frame rates. See [renderer-scheduling.md](renderer-scheduling.md) for paired end-to-end exports.
With all three stacked, the earlier live synthetic-input check held 29.5 of 30 frames/s in a
headless 1280x800 window; offline scheduling does not change the live browser.

The software benchmark measures 20 warmed 1080p frames on SwiftShader, with GPU visualizers at
half resolution. It includes readiness and JPEG-95 screenshot readback, reported as
`captureFrameMs`. The local run measured 49.1 ms for field, 52.7 ms for tunnel, 117.2 ms for
constellation and 62.3 ms for spectrum. These short measurements include capture overhead and
exclude encoding. Constellation remains the most expensive; lower its resolution on software
graphics. Earlier results (33 ms for field/tunnel/spectrum and 69–72 ms for constellation)
measured readiness alone. Since drawing can still be in flight when readiness returns, those
numbers do not establish completed rendering throughput and are not comparable to this metric.

Hardware mixers, long-duration GPU load, physical projectors and cameras, and cross-platform
drivers still need qualification. Linux and Windows have not been run from this local session.
Stateful particle simulation remains out of scope: it would need deterministic replay or
checkpoints to satisfy arbitrary frame requests.

## Shared canvas for visualizer authors

`@setcast/core/react` exports `ShaderCanvas`, `Shader<C>` and `Uniforms`. `@setcast/core` exports
`GpuCanvasConfigSchema` and `GpuCanvasConfig`. A visualizer schema can extend the shared schema
with its own controls. Pass the parsed result, including defaults, to the canvas:

```tsx
import { GpuCanvasConfigSchema } from '@setcast/core';
import { ShaderCanvas, type Shader } from '@setcast/core/react';
import { z } from 'zod';

const schema = GpuCanvasConfigSchema.extend({ speed: z.number().min(0).max(2).default(0.3) });
type Config = z.infer<typeof schema>;

const shader: Shader<Config> = {
  name: 'pulse-disc',
  uniforms: ['phase', 'bass'],
  fragment: `#version 300 es
precision highp float;
uniform vec2 u_size;
uniform vec4 u_color;
uniform float u_phase;
uniform float u_bass;
out vec4 outputColor;
void main() {
  vec2 point = (gl_FragCoord.xy - 0.5 * u_size) / min(u_size.x, u_size.y);
  float radius = 0.2 + 0.04 * sin(u_phase) + 0.08 * u_bass;
  float alpha = (1.0 - smoothstep(radius - 0.01, radius, length(point))) * u_color.a;
  outputColor = vec4(u_color.rgb * alpha, alpha);
}`,
  apply(gl, uniforms, frame, config) {
    gl.uniform1f(uniforms.phase!, (frame.timeSeconds * config.speed % 1) * Math.PI * 2);
    gl.uniform1f(uniforms.bass!, frame.audio.bass);
  },
};

export function PulseDisc({ config }: { config: Config }) {
  return <ShaderCanvas shader={shader} config={config} />;
}
```

Style `.sc-pulse-disc` with explicit width/height and CSS color. Keep the shader descriptor stable,
for example at module scope: replacing it recreates GPU resources. `uniforms` lists names without
the `u_` prefix; `apply` receives locations under those names. The canvas supplies `u_size` in
buffer pixels and `u_color` as straight RGBA from computed CSS color. The fragment must write
premultiplied RGBA to every pixel; transparent areas must also be written.

`apply` sets uniforms from the supplied frame and parsed configuration. It must not retain WebGL
objects or simulation state, change render targets, schedule a drawing loop or depend on call
order. Restoration creates fresh uniform locations and invokes it again with current inputs.
Textures, accumulated particle simulations and custom resource lifecycles need a separate contract.
The canvas handles sizing, adaptive scale, CSS color readback, readiness, recovery and disposal.
This component is an authoring API; it does not add automatic package discovery or loading.

Renderer hosts may implement the optional `RendererBindings.diagnostic` callback. Events have
`level` (`info` or `warning`), `source`, `code` and `message`. GPU recovery uses
`gpu-context-lost` and `gpu-context-restored`; these are operational observations, not timeline
or journal events. Hosts decide where to display them. A diagnostic handler cannot determine frame
readiness, and a handler failure does not interrupt rendering.

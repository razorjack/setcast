# Deterministic GPU field

`field` draws broad, flowing contours with WebGL 2. It works in live input, recorded playback,
Remotion export and browser export. It is opt-in; renderer defaults and existing themes are unchanged.

```yaml
visualizer:
  name: field
  seed: 42
  speed: 0.3
  scale: 1
  gain: 1
  resolution: 0.5
```

Use that block in `setcast.yaml` or `live.yaml`. Run the supplied live preset with:

```sh
node packages/cli/bin/setcast.js live examples/live-field
```

The preset has no credits or clock, a dark background and teal contours. Start input and select
your mixer channels as usual. Performance intensity changes its audio response; brightness and
blackout still apply to the entire output.

## Controls and appearance

- `seed`: integer from 0 to 4294967295, default 1. Selects the arrangement without runtime randomness.
- `speed`: 0 to 2, default 0.3. Scales slow contour motion. Zero freezes motion but keeps audio response.
- `scale`: 0.5 to 4, default 1. Higher values fit more contours in the same box.
- `gain`: 0.1 to 4, default 1. Scales bass, mids and highs before clamping each to full strength.
- `resolution`: 0.25 to 1, default 0.5. Drawing-buffer pixels per composition pixel. Half resolution
  uses one quarter of the full-resolution pixels. The longest side is capped at 4096 pixels or
  the hardware limit, whichever is smaller.

Bass widens and brightens contours, mids strengthen their halos, and highs add restrained
brightness. Motion continues quietly during silence. Intensity zero removes the audio response;
use blackout to remove all light.

The canvas fills the stage by default and has transparent space between contours. It takes its
color from the theme accent. Override `.sc-field` with ordinary CSS:

```css
.sc-field {
  color: oklch(75% 0.13 185);
  opacity: 0.8;
  mask-image: linear-gradient(to bottom, black 60%, transparent);
}
```

CSS controls placement, tint, opacity, blending and masks. Use explicit width and height when
resizing the canvas. Its internal resolution ignores display pixel density and player zoom,
so moving the player between displays does not change the shader's sampling policy. Put `field`
first in a visualizer list when other visualizers should draw over it.

## Frame contract and failures

The shader is a direct function of coordinates, four seeded time phases, audio features and CSS
color. Each layout effect overwrites the complete drawing buffer. There is no animation loop,
feedback texture, wall clock or previous-frame state. Time phases are reduced in JavaScript
before conversion to GPU floats, preserving sub-frame movement during long sessions.

The drawing buffer persists while the renderer waits for fonts, artwork and other readiness
holds. This uses WebGL's `preserveDrawingBuffer` option, which can have a performance cost.
See the [WebGL specification](https://registry.khronos.org/webgl/specs/latest/1.0/).

Missing WebGL 2, shader compilation failure and context loss produce explicit errors. The
visualizer does not silently substitute another effect. Enable browser graphics acceleration,
try another supported `output.gl` backend, reduce field resolution or capture concurrency, or
select an SVG visualizer. After live context loss, reload the player; automatic context recovery
is not implemented.

The same inputs reproduce pixels on the tested browser and graphics backend. Bit-identical
output across GPU vendors, drivers or Chromium versions is not promised. GPU trigonometric
implementations can differ. Preserve the renderer environment when comparing exact images.

## Qualification

```sh
node packages/renderer-browser/bench/gpu.ts
vp run export-acceptance
vp run export-acceptance --adapter ./packages/renderer-browser/src/export/index.ts --out examples/demo/out/browser-acceptance
```

The browser check exercises backward and shuffled frame requests, fresh concurrent capture
pages, seed changes, audio response with frozen motion, CSS colors and resizing, portrait output,
repeated scene remounts, unavailable WebGL and forced context loss. An explicit SwiftShader check
verifies request-order independence on the software backend too. It also starts synthetic live
input, checks advancing frames and restarts capture. It saves images and capture timings under
`examples/demo/out/gpu-check/`.

Both exporter acceptance suites check repeated stills and compare every decoded frame from
one-worker and two-worker exports with one-second chunks. Those comparisons stay within each
adapter, since the adapters use different Chromium runtimes.

Local validation passed `vp run ready` (440 tests, lint/types, Remotion dependency checks and
smoke render), both exporter acceptance suites, the browser field check and
`vp run package-smoke --browser`. CI includes the field check; Linux and Windows qualification
has not been run from this local session.

The benchmark compares 60 warmed 1080p frame requests and JPEG-95 screenshots for half/full
resolution field, spectrum and radial. It records runtime and GPU information, commit time,
capture time and total rate. This includes browser scheduling/readiness and screenshot work;
it excludes bundling, initial shader compilation and video encoding. It is not an isolated GPU
timer or a live frame-rate guarantee.

Local measurement on Apple M1 Pro / ANGLE Metal, Chromium 156.0.8078.4, Node 26.7.0:
field at half resolution captured 20.03 frames/s; full resolution 19.95; spectrum 19.98;
radial 19.97. Mean React commit time was 0.92/0.88 ms for field and 0.79/0.82 ms for SVG.
Mean screenshot time was 28.17/28.03 ms for field and 26.35/26.36 ms for SVG. These short runs
show comparable throughput in this fixture, not a GPU acceleration benefit. The extra GPU
work fits within the capture schedule here. Software rendering passed correctness checks;
its throughput was not benchmarked.

Hardware mixers, long-duration GPU load, physical projectors and cross-platform drivers still
need qualification. Stateful particles remain a later milestone: they need deterministic replay
or checkpoints before they can satisfy arbitrary frame requests.

# Capture without the JPEG round trip

Research date: 2026-10-12. No renderer, theme, configuration or dependency changes.

**Native HTML-in-canvas capture followed by WebCodecs encoding is feasible for Setcast.**
The useful starting point is a recent Remotion 4 release with its matching Chromium build,
not a migration to Remotion 5. The current pinned browser has serious capture defects;
the newer browser fixes the major failures in the sampled themes. This is enough evidence
to justify a prototype, not enough to enable it for every export.

## What would change

The installed `@remotion/renderer` captures each frame through `Page.captureScreenshot`,
receives a base64 image, decodes it into a Node buffer and passes the image to the encoding
pipeline. Our default image format is JPEG. The previous [performance measurements](render-performance.md)
put screenshot capture and image output at 31.73 ms of a 41.70 ms frame in a single render
tab. That includes browser painting and capture work, not just JPEG compression.

The candidate path is:

```text
React frame + readiness holds
  → Chromium paints the DOM into a canvas
  → VideoFrame
  → WebCodecs H.264 encoding
  → encoded video chunks
  → existing continuous audio encode and final mux
```

This removes per-frame JPEG compression, base64 transport and JPEG decoding. It still
renders every frame, runs React and audio analysis, lays out and paints CSS, and encodes
video. It is not necessarily zero-copy: the inspected web renderer copies the native
capture into an OffscreenCanvas before creating a VideoFrame. GPU acceleration and
hardware encoding are separate questions.

Remotion's [`@remotion/web-renderer`](https://www.remotion.dev/docs/client-side-rendering)
already provides the browser-side export API. Native capture is an optional
[`allowHtmlInCanvas: true`](https://www.remotion.dev/docs/client-side-rendering/html-in-canvas)
path, introduced in 4.0.447. The web renderer became stable in 4.0.491, but native capture
still relies on an experimental browser API. This option does not change the existing
Node `renderMedia()` screenshot pipeline.

## Remotion 4 and 5

| Version | Finding | Consequence for Setcast |
| --- | --- | --- |
| Installed 4.0.513 | Matching web-renderer package exists; native capture and streaming output are present. Bundled Chromium is 149.0.7790.0. | API feasibility is established, but this browser fails visibly on several themes. |
| Latest published 4.0.535 | Renderer pins Chromium 157.0.8080.0. Its web renderer supports the revised canvas API. | Best candidate for a prototype, with all Remotion packages upgraded together. |
| Remotion 5 | Official migration guide says unreleased. Neither `remotion` nor `@remotion/web-renderer` had a published 5.x version in the npm registry during this check. | No released v5 runtime could be tested. Waiting for v5 is unnecessary for native capture. |

Published versions were checked against the npm registry metadata for
[`remotion`](https://registry.npmjs.org/remotion) and
[`@remotion/web-renderer`](https://registry.npmjs.org/@remotion%2fweb-renderer).

These are three separate compatibility concerns: Remotion's major version, the exact
Remotion patch, and Chromium's canvas API. Chromium changed `layoutsubtree` to
`content="drawable"` and added a `drawable` attribute on captured descendants. The
4.0.513 source uses the old setup; 4.0.535 sets both canvas attributes and marks the
captured element. Replacing only the browser is not a supported migration strategy.
See the [Chrome API changes](https://developer.chrome.com/blog/html-in-canvas-ot-changes),
the published [4.0.513 capture code](https://unpkg.com/@remotion/web-renderer@4.0.513/dist/esm/index.mjs),
[4.0.535 capture code](https://unpkg.com/@remotion/web-renderer@4.0.535/dist/esm/index.mjs),
and [4.0.535 browser pin](https://unpkg.com/@remotion/renderer@4.0.535/dist/browser/get-chrome-download-url.js).

The installed `openBrowser()` already enables `CanvasDrawElement`; a normal user browser
still needs the feature enabled. Availability must be checked at runtime. Remotion can
fall back to its DOM composer when native capture is unavailable or fails. Setcast should
detect that outcome and use the existing screenshot exporter, because the DOM composer
cannot preserve our theme contract.

The planned [v5 changes](https://www.remotion.dev/docs/5-0-migration) do not remove the
JPEG pipeline by themselves. Relevant migration checks include the `bt709` color-space
default, graphics defaults, readiness/buffering behavior and license-key/telemetry
configuration. Setcast already uses object-form bundling, passes input props, and probes
media through Mediabunny. Its own FFT does not use the changing `visualizeAudio()` default.
`graphicsOptions()` explicitly selects a backend, so v5's default alone would not change it.
The v5 plan also stops publishing `@remotion/webcodecs`; that is a different package from
`@remotion/web-renderer`. Use the latter's Mediabunny-based encoding path for this work.

## Theme compatibility measurements

Tested all 14 built-in themes at demo frame 3312, time 110.4 seconds, with their default
visualizers and normal audio analysis. This moment contains overlapping DJ credits and
a shared drop. Each theme was rendered at 1920×1080 and 1080×1920, on an M1 Pro Mac.

For each case, a normal lossless PNG screenshot was compared with a PNG read from native
canvas capture of the same ready DOM in the same browser. PNG here is only a way to save
comparison evidence, not the proposed video pipeline. Both browser builds were isolated;
the project remained pinned to 4.0.513. The Chromium 157 probe used the canvas attributes
found in 4.0.535. It did not run the complete 4.0.535 `renderMediaOnWeb()` integration.

The table reports the lower RGB SSIM of the two orientations. SSIM ranges up to 1; it is
a comparison aid, not proof that a viewer cannot see a difference. All 28 paired results,
including comparisons between the two browsers' ordinary screenshots, are in the
[measurement CSV](benchmarks/capture-feasibility-2026-10-12.csv).

| Theme | Chromium 149 native | Chromium 157 native | Assessment at the sampled frame |
| --- | ---: | ---: | --- |
| sterile-tech | 0.923942 | 0.999717 | Missing panels and clock on 149; restored on 157. |
| escapement | 0.999841 | 0.999841 | Close in both orientations. |
| long-exposure | 0.997582 | 0.997587 | Close; inspect glow and trails in motion. |
| bristol | 0.999960 | 0.999960 | Close, including its SVG color treatment. |
| patina | 0.998908 | 0.998909 | Close, including textures and masks. |
| quicksilver | 0.998088 | 0.998088 | Close; inspect reflective shading and glows. |
| bunker | 0.998668 | 0.998668 | Close, including layered art. |
| vfd | 0.012459 | 0.998940 | Severe portrait corruption on 149; restored on 157. |
| interference | 0.998268 | 0.998278 | Close, including the layered ghosts. |
| pirate | 0.591364 | 0.986554 | Large missing regions on 149; restored on 157. Largest remaining difference is portrait. |
| afterhours | 0.968437 | 0.995136 | Missing content on 149; restored on 157. Inspect glass and text treatment. |
| passe-partout | 0.997947 | 0.997946 | Close in both orientations. |
| masthead | 0.999999 | 0.999999 | Essentially identical in this sample. |
| anamorphic | 0.999996 | 0.999996 | Essentially identical in this sample. |

The ordinary screenshot comparisons between Chromium 149 and 157 ranged from 0.999578
to 1.000000. Most of the improvement therefore comes from native capture behavior,
not from a large change to the reference appearance.

On Chromium 149, extra paint cycles, capturing the enclosing composition instead of the
stage, and switching ANGLE to software graphics did not resolve the major failures.
The inspected panel and clock bounds and computed layout styles stayed unchanged.
Temporarily removing backdrop filters restored sterile-tech's missing content, raising
landscape SSIM to 0.999185, but also changed its appearance. No such workaround was
applied to the Chromium 157 measurements or committed to any theme.

The CSS audit explains why the default web renderer is unsuitable. Themes use blend
modes, backdrop filters, SVG filters, repeated and layered masks, textures, pseudo-elements
and stacking order. Even the simpler themes use radial gradients; the shared visualizers
also require correct composition. Remotion's [DOM composer limitations](https://www.remotion.dev/docs/client-side-rendering/limitations)
exclude several of these features. Browser layout support for container queries or CSS
anchors does not compensate for missing painting operations.

Native capture keeps Chromium responsible for CSS painting, so it preserves much more
of the existing scene. The [HTML-in-canvas proposal](https://github.com/WICG/html-in-canvas)
still excludes sensitive or cross-origin content from readback. Our local assets,
inlined fonts and generated image blobs are favorable, but arbitrary remote plugin
assets and custom CSS need their own checks.

## Integration work still required

- **Frame readiness:** advance absolute frames, await Setcast's holds and React layout
  effects, then await native paint. Scope the adapter's global `delayRender()` bindings
  to the web-renderer instance. The windowed audio hook already uses `useDelayRender()`.
  Fonts, image preparation, art alignment and the spectrogram canvas must all finish
  before capture. A canvas API being present does not establish that the correct frame
  was captured.
- **Video backgrounds:** the current binding uses `OffthreadVideo`, which the web renderer
  does not support. It would need `Video` from `@remotion/media` or another explicit
  frame source. Preserve looping, contain/cover behavior and theme CSS. This is material:
  our existing choice of OffthreadVideo avoids the media Video component's inline
  `object-fit` overriding theme rules. See [Remotion's migration guidance](https://www.remotion.dev/docs/client-side-rendering/migration).
- **Long exports:** retain bounded batches and one continuous master-audio encode.
  `outputWritable`, available since 4.0.508, can stream encoded output instead of
  accumulating a full export. A Node CLI needs a browser-to-file bridge that respects
  byte positions and backpressure. The [API](https://www.remotion.dev/docs/web-renderer/render-media-on-web)
  provides the stream but not Setcast's orchestration, atomic output or failure cleanup.
- **Encoding:** map quality to WebCodecs bitrate/quality controls; x264 CRF and presets
  do not carry across. Verify color, gradients, timestamp rounding and chunk joins.
  A probe encoded 60 repeated 1080p native-canvas frames to H.264 on both Chromium 149
  and 157, with hardware-preferred and software-preferred configurations. This proves encoder
  access, not sustained throughput or equivalence to the current output settings.
- **Fallback and packaging:** keep Remotion imports inside the adapter. Pin and verify
  the browser, confirm the native path ran, and retain screenshot export for unsupported
  machines or scenes. The browser API remains experimental. Web-renderer
  [telemetry](https://www.remotion.dev/docs/telemetry) also applies in v4; assess it as an
  integration behavior, not as a reason to wait for v5.

## Other ways to remove JPEG

Changing screenshot format to PNG or WebP still serializes and decodes an image per
frame. CDP's [`Page.captureScreenshot`](https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-captureScreenshot)
offers those encoded formats, not raw pixel buffers. Puppeteer or Playwright alone
therefore does not remove the round trip.

[Electron offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering)
can expose Chromium output as a bitmap or shared GPU texture. A bitmap-to-FFmpeg adapter
could avoid JPEG while retaining browser painting. This is a larger alternative renderer:
it needs frame synchronization, dirty-region handling and media readiness. Shared GPU
textures require native integration. Raw 1080p RGBA is 8.29 MB per frame, about 249 MB/s
at 30 fps, so memory transfer can replace compression as the bottleneck. This path was
researched from the API documentation, not implemented or benchmarked.

Recording a real-time display or canvas stream does not by itself provide deterministic,
faster-than-real-time offline export. Manual DOM-to-canvas reconstruction would require
substantial theme changes. Neither is the preferred next step.

## Recommendation and limits

Prototype native capture on an aligned recent Remotion 4 / Chromium 157 combination,
starting with image backgrounds and preserving the screenshot exporter. No theme rewrite
is justified by this sample. Do not ship the Chromium 149 results as an approximate
quality mode: missing credits and corrupted output exceed the allowed visual difference.

Before adopting it, compare moving clips across all themes, portrait and landscape,
bright and busy art, no art, background changes, video loops, custom visualizers and
chunk boundaries. Run a sustained export with matching output quality and measure total
time, peak memory, frame count and audio synchronization. The static encoder probe and
isolated paint timings cannot establish an end-to-end speedup; the earlier 76% capture
share must not be interpreted as 76% removable work.

Only one timeline moment and the demo art were compared here. The full web-renderer
adapter, video-background migration, arbitrary plugins, Linux/Windows and hour-long
exports remain untested. Remotion 5 compatibility can only be assessed against its
current migration plan until a release is available.

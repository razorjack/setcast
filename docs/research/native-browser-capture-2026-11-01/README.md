# Independent native-capture qualification, 1 November 2026

Native DOM-to-canvas capture is rejected for production in this milestone. All 192 sampled
theme frames exceed the existing source-precision allowance, as do 60 samples covering field,
tunnel, constellation, looping video and changing art/branding. Twelve Pirate samples in
Chromium 157 reproduce the same differences observed in pinned Chromium 156. Neither exact
RGBA equality nor the predefined sparse one-channel-level allowance passes. No encoding or
throughput claim follows from this failed pixel qualification.

The independent browser adapter's frame driver supplies absolute time, React commits, media
readiness and paint invalidation. The benchmark compares ordinary PNG screenshots with native
`drawElementImage` capture in the same Chromium, at device scale one, using sRGB canvas decoding.
It captures six ordered/shuffled moments around an art transition in both 1920×1080 and
1080×1920. It keeps the complete stage subtree, including its GPU canvases, inside the native
drawable root. No Remotion package or DOM-reconstruction library is imported by this probe.

The current pinned browser exposes neither `drawElementImage` nor `requestPaint` without
`--enable-blink-features=CanvasDrawElement`. `api.json` preserves both checks. The candidate uses
Chrome's documented [drawable canvas setup](https://developer.chrome.com/docs/web-platform/html-in-canvas/concepts)
and [2D paint API](https://developer.chrome.com/docs/web-platform/html-in-canvas/2d), checked on
1 November 2026. API availability alone does not establish CSS fidelity.

The portrait Pirate pair was inspected, including the committed lossless credit crops.
The text rasterization visibly differs; retaining the same layout is insufficient. The
benchmark does not identify a Chromium root cause or prove that every alternative native
integration must fail. A future implementation must repeat this qualification before adding
WebCodecs/muxing and complete-export timings. Do not weaken the CSS contract or enable the
experimental flag in production to bypass these results.

Reproduce all themes:

```sh
node packages/renderer-browser/bench/native-capture.ts examples/demo --out NEW_DIRECTORY
```

For the corpus fixtures, pass their generated project directory and `--theme sterile-tech`.
The default frames are 3149, 3150, 3151, 3029, 3030 and 3149. `--executable-path` permits an
explicit research runtime; the Chromium 157 run used the binary already provisioned by the
isolated upstream comparison checkout. It is not a production dependency or browser upgrade.
Reports retain versions, paths, flags, frame indices and both RGBA hashes. Full PNG pairs remain
under the corresponding ignored `examples/demo/out/native-browser-*-2026-11-01` directories.
The script was formatted/refactored during this study without changing capture operations.

Screenshot capture remains the compatible production route. A custom shared-memory Chromium
or Electron host still introduces a separate binary distribution/update obligation, documented
in [capture feasibility](../../capture-feasibility.md#other-ways-to-remove-jpeg). No such host is
qualified by this experiment. Rejection is the phase-2 outcome; native capture is not required
for the browser-first H.264 workflow.

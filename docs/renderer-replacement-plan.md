# Independent renderer replacement plan

Ongoing observations, failed experiments and validation results are recorded in
[renderer-replacement-log.md](renderer-replacement-log.md).

Research and planning date: 2026-10-29. Repository baseline: `5c4eee5`.
Status: implementation in progress; completed pieces and validation are tracked in the log.
Remotion remains the default until the release criteria below are met.

Setcast should replace Remotion with a renderer that preserves the existing CSS and timeline
contracts, finishes first exports faster, reuses work across revisions, and connects musical
preview with export. Independence is already implemented in the browser execution path. The
remaining work is to establish a better product and remove the installation dependency.

This plan consolidates source inspection, existing local measurements and upstream documentation.
It does not report a new benchmark. Measured results, source-level findings, experiments and
proposed acceptance targets are identified separately. The 30% wall-time target is a product
objective, not a prediction supported by the existing comparisons.

## Roadmap assessment

The [rendering and live roadmap](rendering-and-live-roadmap.md) has delivered much of its original
renderer foundation: deterministic absolute-frame requests, bounded PCM windows, explicit media
readiness, independent preview, capture/encoding overlap, display-unpaced offline scheduling,
resume, capabilities, setup diagnostics and decoded export verification. GPU visuals and journal
replay already use Setcast-owned contracts. These are foundations to retain, not new milestones.

The subsequent roadmap lists plugin loading, portable scenes, metadata adapters and beat-tracking
evidence ahead of renderer qualification. For the replacement objective, give the sequence in this
document priority over broad plugin infrastructure, additional effects and scene-collection work.
Keep those product candidates in the roadmap. Continue necessary correctness and live reliability
fixes, and run packaging/platform qualification throughout renderer development.

The useful distinction is between three outcomes:

- Faster first exports through cheaper video-frame preparation, capture and scheduling.
- Faster subsequent exports through persistent reuse and shared batch preparation.
- A better workflow through audio-aware preview, exact inspection, export control and dependable
  installation. A renderer can improve one outcome without improving the others.

## Current capabilities

These are the capabilities of Setcast's adapters, not the full upstream Remotion product.
Sources: [browser descriptor](../packages/renderer-browser/src/capabilities.ts),
[Remotion descriptor](../packages/renderer-remotion/src/capabilities.ts),
[browser guide](browser-renderer.md) and [preview contract](independent-preview.md).

| Capability | Browser adapter | Remotion adapter |
| --- | --- | --- |
| Shared Setcast scene, timeline, audio and CSS contracts | Supported | Supported |
| PNG, JPEG and WebP stills | Supported; no system FFmpeg needed | Supported |
| H.264 video and AAC soundtrack | MP4, MOV and MKV | MP4, MOV and MKV |
| Hardware encoding | VideoToolbox implemented and checked on M1 Pro; NVENC implemented, device qualification pending | VideoToolbox on macOS; NVENC on supported Linux/Windows systems |
| Concurrency | Manual 1–8, default 1 | Automatic or explicit |
| Graphics selection | `auto`, `default`, `angle` | Additional backend choices |
| Parallel encoding | Required | May be enabled or disabled; bounded chunk fallback when applicable |
| Resume completed chunks | Supported on `render` | Explicitly rejected |
| Preview | Exact-frame inspector, silent sequential playback | Remotion Studio |
| Runtime | Pinned Playwright Chromium, system FFmpeg for video | Remotion Chrome Headless Shell and packaged binaries |

Both adapters already preserve absolute frame ranges and encode a continuous master soundtrack
for audible exports. Browser capture overlaps ordered encoder writes with bounded buffering.
`withRenderSession` already reuses a browser and bundle across multiple operations; batch reuse
must extend that implementation rather than add another session abstraction.

The browser package has no Remotion dependency. The
[CLI package](../packages/cli/package.json) still directly depends on the Remotion adapter.
Import-free browser execution therefore does not establish a Remotion-free installation.

### Upstream comparison, checked 2026-10-29

Setcast pins Remotion 4.0.513. Current upstream documentation describes shared-memory video
capture from 4.0.534, using a special Chromium 157 build on supported Apple Silicon and Linux
systems. Eligible parallel video renders pass uncompressed bitmaps to the encoder; unsupported
platforms and paths retain screenshots. Record the actual path in comparisons, including
Setcast's conditional image-sequence fallback. See
[shared-memory capture](https://www.remotion.dev/docs/shared-memory-capture).

Upstream also provides six video codecs (H.264, H.265, VP8, VP9, AV1 and ProRes), hardware
encoding, Studio and distributed rendering. Setcast currently exposes only H.264/AAC video through
either adapter. Codec support and cloud distribution are separate comparisons from the installed
Setcast integration. See [encoding](https://www.remotion.dev/docs/encoding),
[hardware acceleration](https://www.remotion.dev/docs/hardware-acceleration) and
[Lambda](https://www.remotion.dev/docs/lambda).

Remotion's browser-side renderer has been stable since 4.0.491 and uses WebCodecs/Mediabunny.
Its default DOM compositor supports a subset of CSS; optional HTML-in-canvas uses native browser
painting. A Setcast implementation should use the browser APIs independently, retaining the ban
on Remotion imports outside its adapter. Using WebCodecs, a GPU or a browser is not by itself a
competitive advantage. See [client-side rendering](https://www.remotion.dev/docs/client-side-rendering),
[limitations](https://www.remotion.dev/docs/client-side-rendering/limitations) and
[native capture](https://www.remotion.dev/docs/client-side-rendering/html-in-canvas).

### Earlier research that constrains the plan

The [capture feasibility report](capture-feasibility.md) already compared native capture with
lossless screenshots for the 14 themes available at that time, in both orientations at one demo
moment. Chromium 149 lost content or corrupted several themes. Chromium 157 restored the major
failures, but differences remained, particularly Pirate portrait. The experiment did not exercise
all current themes, moving scenes, the complete export integration or long exports. A 60-frame
repeated-image encoder probe established encoder access, not throughput. Extend this evidence;
do not restart feasibility research or describe native capture as qualified.

That report explored integration through Remotion's web renderer. The new implementation target
is the independent browser adapter. Reuse the fixtures and browser-compatibility findings, not
the proposed Remotion dependency. Chromium API attributes changed between the tested versions;
matching API setup and runtime identity matter independently of Remotion's major version.

The [15 October performance follow-up](render-performance.md#parallel-encoding-follow-up-15-october-2026)
tested and rejected Remotion 4.0.534 after an encoder failure produced an unhandled `EPIPE` before
cleanup. That candidate explicitly disabled shared-memory capture and used Chromium 149 on
macOS. It is neither a shared-memory benchmark nor proof that a current upstream release still
has the failure. Keep production pinned until a deliberate upgrade passes failure tests. A new
upstream comparison must include that regression without changing Node's rejection policy.

The [current 4.0.539 exercise](research/remotion-539-2026-10-29/README.md) passes export acceptance
and the caught-error/destination checks using shared-memory capture. Named pool cleanup and the
full matched-quality comparison remain unverified. Additional native and 4.0.535 research at
`prototype/native-capture` commit `308b1cc` is summarized there, including per-play layout limits
and intermittent POSIX-pool leaks in the older upstream version.

The same report records Linux/NVIDIA results for the Remotion adapter. Those do not qualify the
independent browser adapter on Linux. Platform claims must identify the adapter and runtime.

## Performance evidence and its limits

| Existing observation | Result | What it establishes |
| --- | --- | --- |
| Initial two-minute 1080p comparison | Browser about 169 s; Remotion about 144 s | Early browser prototype was about 18% slower in that local run; concurrent work limits precision. |
| Readiness optimization, 300 frames | 16.86 → 13.40 s | Two stable callbacks improved that workload with identical decoded frames. |
| Capture/write overlap, two 300-frame pairs | 13.55/14.19 → 10.56/10.48 s | Bounded overlap reduced elapsed time 22–26% in those pairs. |
| Offline scheduling, one worker | 22–33% reductions across measured scenes | Removing display pacing helped without changing compared frames. |
| Branded one-minute scheduling pair | 94.53 → 63.45 s | Sustained improvement within that pair, not a current Remotion comparison. |
| Full 3372-second real master | 2757.31 s, 101160 frames, 36.69 fps | Browser export completed at 1.22 times real time on one M1 Pro workload. |

Sources and raw data: [browser renderer](browser-renderer.md),
[scheduling measurements](renderer-scheduling.md),
[pipeline CSV](benchmarks/browser-pipeline-2026-10-22.csv),
[scheduling CSV](benchmarks/browser-scheduling-2026-10-22.csv) and
[sustained qualification](qualification-2026-10-23.md#full-real-master-export).
These experiments use different revisions and workloads. Do not combine their reductions or
use the old 169/144-second pair as a present-day comparison.

The full-master run recorded these mean stage times:

| Stage | Milliseconds per frame |
| --- | ---: |
| Audio-window preparation | 0.081 |
| Frame-state resolution | 3.743 |
| React commit | 1.376 |
| Asset/paint readiness | 1.155 |
| Screenshot capture | 18.328 |
| Encoder pipe waiting | 1.121 |

Final assembly took 108.67 seconds. The full video decoded successfully; six selected stereo
windows aligned at zero lag at 16 kHz, with joint correlations 0.9993–0.9999. Silent-tail windows
were correctly inconclusive. This verifies sampled alignment and frame decoding, not every
scene pixel or every audio sample. Node RSS excluded Chromium and FFmpeg, and other work ran
concurrently. There was no matched full-master Remotion arm.

Screenshot timing includes painting, synchronization, readback, compression and transport; it
is not all removable JPEG cost. Pipe waiting is not encoder CPU time. Audio preparation excludes
feature work in resolution/components. Parallel stage durations overlap and must not be summed
as wall time. FFT improvements already benefit both exporters and do not prove export speedups.

### Concrete implementation findings

- [Video preparation](../packages/renderer-browser/src/export/video.tsx) decodes a canvas, copies
  it into another canvas, calls `toDataURL('image/png')`, then displays an image for capture.
  The recorded looping-video case spent 15.69 s in readiness during a 24.71 s export. Readiness
  includes more than PNG conversion, so isolate decode, copy, serialization and image decoding.
- [Frame capture](../packages/renderer-browser/src/export/render.ts) takes a JPEG screenshot
  for every frame. FFmpeg decodes that JPEG before H.264 encoding. Switching image formats or
  calling CDP directly does not remove this conversion. The earlier direct-CDP experiment did
  not improve the initial comparison and was not retained.
- [Scheduling](../packages/renderer-browser/src/export/pipeline.ts) assigns frames round-robin.
  Each page owns bounded analysis/decoder state. More workers can duplicate work and compete for
  GPU resources. More tabs are not automatically faster.
- [Assembly](../packages/renderer-browser/src/export/encoding.ts) originally encoded master audio
  after video chunks finished. The browser exporter now starts the continuous master-audio encode
  alongside video work and shares failure cancellation. The [Remotion adapter](../packages/renderer-remotion/src/chunks.ts)
  already uses this overlap. See the implementation log for validation.
- [Resume](browser-renderer.md#resume-an-interrupted-export) requires an identical job fingerprint,
  including concurrency and runtime/host identity, and removes checkpoints after success. It is
  interruption recovery, not a persistent cache for revisions or cross-machine artifacts.
- [Preview](independent-preview.md) already shares the exact export driver, supports frame
  inspection, project reload and reference overlays. Its playback is silent; it cannot launch
  exports. Playback via `setcast play` exists separately and uses approximate running video sync.

## Contracts to preserve

Keep `RenderFrame`, range rounding, timeline queries, motion, modulation and audio analysis owned
by Setcast. Offline output uses absolute frames, including arbitrary seeks and fresh workers.
Keep the full theme CSS contract, explicit font/image/video/GPU readiness, bounded memory and
backpressure. A successful frame acknowledgement must identify the requested completed frame.

Preserve one continuous master soundtrack, rounded range origins and fractional-final-frame
behavior. Do not independently encode AAC per chunk and assume gapless joins. Retain atomic output
replacement, cancellation, resource cleanup, checkpoint validation and input-change detection.
FFmpeg remains a subprocess. Native capture must not introduce Remotion dependencies into core,
themes, plugins or the browser adapter.

Do not change output resolution, FPS, visualizer complexity, JPEG quality or encoding quality
silently to claim a speedup. Live adaptive resolution remains separate from offline quality.
Do not replace explicit readiness with elapsed time or record real-time playback as an offline
renderer. Native capture availability alone does not prove correct pixels or hardware encoding.

## Delivery sequence

Phase 0 is in progress. Phase 1's first candidate was rejected; phase 3 audio overlap and hardware
encoding are implemented. The remaining deliverables below are still pending. The installed-adapter comparison
runner and opt-in browser/graphics/encoding observations are implemented as described in [render-comparison.md](render-comparison.md). Full upstream,
quality and platform comparisons are still required. The phases describe implementation work,
not newly supported renderer flags or APIs.
Benchmarking and release qualification continue across phases. Color/fidelity fixtures begin in
phase 0; the additional output formats arrive later.

| Phase | Deliverable | Completion evidence |
| --- | --- | --- |
| 0 | Current comparative benchmark and regression corpus | Reproducible reports for browser, installed Remotion and a qualified current upstream baseline |
| 1 | Direct decoded video frames | Faster video workloads with correct seeks, loops, CSS and bounded resources |
| 2 | Capture without intermediate image compression | Qualified fast path or a documented rejected experiment; screenshot compatibility retained |
| 3 | Resource-aware scheduling and encoding | Useful automatic defaults, hardware encoding, continuous audio overlap and safe recovery |
| 4 | Persistent reuse | Identical successful jobs avoid capture; validated local edits invalidate only proven dependencies |
| 5 | Unified preview and export workflow | Audible playback, exact inspection and actionable export controls |
| 6 | Explicit output fidelity and compositing formats | Qualified color handling, transparent output and editing intermediate |
| 7 | Browser-first distribution and migration | Clean Remotion-free installs, platform evidence and release criteria satisfied |

### Phase 0: establish a fair benchmark

Compare three identified implementations: the current browser adapter, the installed Setcast
Remotion integration, and a current upstream Remotion configuration with compatible browser and
packages. Keep upstream experiments isolated from production dependencies. Record actual capture
transport, graphics backend, encoder, concurrency and overlap decisions. Do not force private
memory heuristics or ignore failure behavior to manufacture a faster reference.

Use CSS-heavy typography/filter scenes, field/tunnel/constellation, looping video, changing art,
branding, DJ overlaps and portrait layouts. Include 1080p30, representative 60 fps and 4K stress
cases, short clips, chunk-boundary cases and a long real master. Extend correctness checks to all
16 current themes. Use legally usable fixtures for portable automation; do not commit local masters.

Separate cold preparation, warm exports, repeated jobs and edited-project exports. Run at least
three alternating paired repetitions for short performance cases; repeat long cases before a
general claim. Record revisions, input hashes, exact commands, runtime versions, failures and
background load. Report medians and spread, not only the best sample.

Measure end-to-end wall time, stage distributions, time to first frame, process-tree memory,
temporary disk use, encoded size and cleanup. Process-tree RSS can double-count shared pages;
label it accordingly and use platform memory/GPU tools where available. Preserve existing metrics
but do not present Node-only RSS as total render memory.

Use exact pre-encode pixel comparisons for transformations intended to preserve pixels in a
matching runtime. For changed capture/encoding, compare against lossless references, inspect
text, dark gradients, glows and edges, and report encoded quality and size. Equal CRF values
across encoders, or one global SSIM value, do not establish matched quality. Keep timestamp,
decoded-frame, chunk-boundary and stereo-alignment verification separate from image quality.

### Phase 1: remove video-frame PNG serialization

The first direct-canvas candidate was rejected on 2026-10-29: it changed rendered pixels and was
slower in two alternating benchmark series. See the [experiment and retained evidence](research/video-canvas-2026-10-29/README.md).
Production retains the PNG image path. Revisit decoded-frame representation with a different
capture transport; do not promote the rejected candidate or assume fewer conversions are faster.

Measure the existing conversion stages, then replace PNG serialization and image decoding with
a persistent drawable canvas or equivalent decoded-frame representation. Keep frame ownership
explicit so a decoder pool cannot overwrite a frame before capture. Release replaced resources.

Preserve contain/cover behavior, intrinsic dimensions, filters, transforms, masks, theme selectors
and the blurred contain background. Changing an `img` to `canvas` can affect CSS and layout, so
test those dependencies explicitly. Verify backward/shuffled seeks, different source/output frame
rates, loop boundaries, source changes, end-of-file behavior and readiness failures.

Use a byte/resource-bounded cache only where repeated decoded frames justify it. Do not predecode
an arbitrary full video or retain every loop frame. Accept the change only after measured video
workloads improve without incorrect frames or unbounded memory.

### Phase 2: qualify a faster capture transport

The current route is browser painting → JPEG → Node buffer → JPEG decode → H.264. Compare two
alternatives through a small adapter-local capture boundary; do not design a general backend
framework before a working second path exists.

First extend the existing native HTML-in-canvas experiment using Setcast's browser export driver:
absolute frame → readiness → native paint → `VideoFrame` → WebCodecs/Mediabunny → streamed encoded
chunks. Chrome documents DOM capture into 2D/WebGL/WebGPU contexts in its
[HTML-in-canvas guidance](https://developer.chrome.com/docs/web-platform/html-in-canvas).
Probe the exact pinned browser/API combination and identify the active capture path. Preserve
nested GPU canvases, pseudo-elements, stacking, backdrop filters, SVG filters, masks, container
queries and fonts. Extend the old single-frame samples to motion, all current themes and real art.

Stream output with bounded queues and backpressure, including file-position semantics where the
muxer requires them. Do not accumulate an hour-long output Blob in memory. Preserve the continuous
master-audio policy and verify timestamps, encoder priming and joins. WebCodecs quality controls
are not x264 CRF/presets; unsupported settings need an explicit configuration policy.

If native capture cannot meet the CSS contract or throughput objective, evaluate bitmap/shared-memory
capture into an FFmpeg subprocess. A custom Chromium build or Electron offscreen host adds native
integration, browser update and distribution obligations. Shared GPU textures are a separate
integration from CPU bitmaps. Raw 1080p RGBA is about 8.29 MB/frame, or 249 MB/s at 30 fps, so
transport and memory copies can replace compression as the bottleneck. Neither design is assumed
zero-copy. The [earlier feasibility report](capture-feasibility.md#other-ways-to-remove-jpeg)
records the Electron alternative and its unmeasured status.

Keep screenshot capture as the compatibility path. Capability selection must be observable and
must not fall back to a CSS-incomplete DOM reconstruction engine. If capture changes after a job
has started, fail or restart with a consistent identity rather than silently mixing checkpoint
semantics. This is an internal capture choice, never a silent switch back to Remotion.

Retain a fast path only when it passes readiness/failure/quality checks and improves complete
exports. Missing credits or content are failures, not an approximate quality mode. A rejected
experiment is a valid phase outcome; do not ship it to satisfy the schedule.

### Phase 3: schedule within the machine's resource budget

Add short, bounded calibration across representative project moments, including costly scenes.
Choose concurrency within explicit memory/resource limits and report the decision. Calibration
cost belongs in end-to-end timings. Keep an explicit override and avoid retuning identical jobs
without invalidating the calibration's runtime/project identity.

Compare round-robin frames with contiguous blocks or independent chunk workers. Investigate
decode locality, GPU contention, head-of-line waiting, page startup and encoder contention.
Keep queues bounded and final output ordered. Chunk scheduling must not change absolute time,
history availability or joins. Freeze selected settings for a resumable job; reuse across a
different schedule requires separate proof that the cache contract permits it.

Implement hardware H.264 first through qualified VideoToolbox and NVENC paths. Probe actual
encoding, not just the encoder's presence in FFmpeg. Preserve `disable`, `if-possible` and
`required` behavior with explicit diagnostics. Consider Intel/AMD paths after platform evidence.
Preserve software encoding for compatibility and quality choices. Verify real encoder failure,
device failure, cancellation and output preservation; do not add process-wide rejection handlers.

Overlap the continuous master-audio encode with video work, as the Remotion adapter already does,
unless measured contention outweighs the benefit. Cancellation must settle both jobs before
cleanup. Distinguish audio encode from final mux in metrics. Re-profile after capture changes:
the current small pipe waits do not predict the next bottleneck.

### Phase 4: persist useful work after a successful export

The initial implementation adds opt-in bounded video-chunk reuse for identical jobs, with explicit
inspection/clearing and conservative whole-job invalidation. See the implementation log for checks
and [browser cache usage](browser-renderer.md#persistent-reuse-after-successful-exports). Selective
reuse after edits, prepared-asset caching and broader batch reuse remain pending.

Implement an opt-in, bounded content-addressed cache separately from interruption checkpoints.
Start with identical completed chunks and validated prepared assets. Retain proven identity,
checksums, atomic publication, writer coordination and input-change checks. Add size limits,
eviction, inspection and explicit clearing; do not leave unlimited intermediates on disk.

Separate preparation, frame and encoded-output identities. Reuse browser/bundle preparation and
analysis across a master, clips and thumbnails where compatible. Encoded chunks can be reused
only with matching encoding and valid cut/keyframe constraints. Different aspect ratios and
layouts generally require new captures. Different codecs cannot simply reuse old encoded chunks.

Add local-edit invalidation only after identifying the dependencies of each range. A late
announcement may affect a limited range; global CSS, fonts, themes or untracked plugin behavior
may affect every frame. A listing edit can change earlier upcoming displays. Include lookback,
lookahead, transitions, focus, scene references and whole-set analysis where relevant. Until
dependencies are proven, invalidate conservatively. Compare every incremental result with a
fresh full render in regression fixtures.

The initial cache remains scoped to qualified runtime/host identities. Cross-machine reuse is a
separate portability decision, not an accidental consequence of content hashing. Success means
identical repeat jobs capture no new frames, while supported local changes avoid recapturing
unaffected ranges without serving stale output.

### Phase 5: connect musical preview to export

Extend the existing inspector and player rather than building another rendering model. Provide
audio-synchronized playback and exact-frame inspection when paused. Real-time playback may skip
display updates to follow the audio clock; exact inspection must wait for the requested frame.
Label those modes and test the transition between them, including background-video synchronization.

Add navigation by listings, annotations, beats and scene changes, then range selection, export
queue, cancellation, progress and resume. Reuse CLI/core validation and renderer diagnostics.
Show numeric reference differences and slow-frame details with actionable asset labels. Offer a
pinned-runtime reference mode because a user's browser cannot promise export-identical pixels.

The current preview server is read-only. Export controls require a separately designed local job
API, origin/request checks, output-path validation and lifecycle ownership. Do not turn arbitrary
preview requests into filesystem writes or shell execution. No code editor or general NLE is
required to remove Studio from Setcast's normal workflow.

### Phase 6: make output fidelity explicit

Define the browser-pixel to encoded-video color contract: transfer/primaries, matrix, range,
pixel format and alpha premultiplication. Verify actual decoded output and metadata. Historical
Remotion measurements recorded unexpected full-range/color tags; preserve that evidence without
treating the old export as an unquestionable color reference. Test dark gradients, saturated
highlights, fine type, glows, masks and compositing over both light and dark backgrounds.

After H.264 parity, add a qualified transparent-overlay output and editing intermediate, initially
investigating VP9 alpha and ProRes 4444. An alpha codec alone does not make an opaque theme
transparent: define a stage/background mode and supported composition behavior. Extend configuration,
capability descriptors, validation and diagnostics together. Test with intended receiving apps.

These outputs support OBS overlays and compositing with filmed performances. They are useful
parity and workflow features, not evidence of faster H.264 export. Do not make an exhaustive codec
catalog or HDR implementation a prerequisite for removing the current H.264-only dependency.

### Phase 7: distribute and qualify the independent renderer

Produce a browser-first CLI distribution whose required dependency graph contains no Remotion.
Resolve the remaining adapter-specific types/defaults and package-smoke assumptions deliberately.
Verify a clean install with Remotion packages physically absent, not only blocked imports.

Define reproducible browser/FFmpeg provisioning, supported system overrides, checksums and runtime
identity reporting. Keep installation explicit and diagnostics read-only. New native binaries or
browser builds need a maintained update/distribution path; FFmpeg remains a subprocess. Test
offline use after provisioning and actionable behavior for missing or incompatible tools.

Qualify installed packages on macOS, Windows and Linux, recording actual GPU/software backends,
encoders and capture paths. Cover long exports, video inputs, fonts, all themes, repeated seeks,
device/encoder failures, disk exhaustion, cancellation, corrupt checkpoints and clean recovery.
Unsupported historical Remotion-only settings must be supported or receive a documented migration
diagnostic before the default changes; they must never be silently ignored.

Keep Remotion as a comparison/compatibility option during qualification. Then change the default
and remove it from required installation. Retain an optional adapter only if there is a concrete
compatibility need; deleting its code can follow independently. Update scaffolds, README, help,
CI and package tests in the same migration. This planning document changes no production defaults
or dependencies.

## Live reliability remains a separate qualification

The independent renderer also owns live output, but offline success does not qualify unattended
shows. The [software qualification plan](software-qualification-plan.md) and
[sustained report](qualification-2026-10-23.md) retain failed SwiftShader runs, including skipped
analysis during scene/context work. Short passes and the corrected watchdog do not erase them.

Continue isolating context creation, disposal and drawing stalls. Evaluate bounded context reuse
with explicit ownership, resource limits, correct recall state and disposal on shutdown. Consider
dedicated-worker analysis only if transport/main-thread measurements justify it. Do not increase
queues indefinitely, assume asynchronous shader compilation fixes native context stalls, or
infer physical presentation rate from readiness/update counters.

Physical mixers, MIDI controllers, OBS, cameras, displays and projectors need their own evidence.
These do not block a narrowly qualified offline release, but must block unsupported live claims.

## Deferred approaches and reasons

- A wholesale Canvas/WebGPU scene rewrite would put CSS typography and theme compatibility at
  risk. Native browser painting and stateless GPU visualizers remain compatible with the contract.
- A mandatory full-set audio sidecar does not target the current dominant capture cost. Add
  shared analysis only for measured reuse/decode benefits, preserving off-grid smoothing, stereo
  power, waveforms and the eight-second history contract.
- A distributed render farm adds transfer and orchestration work before local efficiency is
  established. Current upstream already offers distribution, so cloud execution alone is not an
  advantage. Revisit after local chunk/cache identity is sound.
- Static-layer caching or reduced-resolution photographic layers may help individual themes,
  but animated CSS, backdrop filters and blend dependencies make blanket caching unsafe. Keep
  full-resolution type and treat such changes as separately measured, explicit quality choices.
- Another screenshot library, JPEG-to-PNG/WebP substitution, more tabs, or real-time recording
  does not inherently remove the measured capture bottleneck.
- More effects, broad plugin infrastructure and scene archives remain useful product work, but
  do not establish renderer replacement. Preserve future plugin compatibility without designing
  speculative renderer frameworks.

## Release criteria

Replacement requires correctness, installation independence and supported workflow coverage.
Claiming that the renderer is better and faster additionally requires measured throughput and
iteration benefits. Track each requirement with the producing revision and retained reports.

- [ ] Existing Setcast render/still/clip/preview/bundle workflows work without Remotion installed.
- [ ] Required theme/CSS, frame, audio, video-loop and readiness checks pass on supported runtimes.
- [ ] Real capture/encoder failures, cancellation and resume preserve existing output and clean up
  active resources; corrupt/stale cache entries cannot produce a successful stale export.
- [ ] Installed-package and sustained export checks pass on each advertised platform/backend.
- [ ] Comparative results identify current upstream versions and actual paths. Target at least
  30% lower median wall time than tuned current Remotion on the predefined core workload suite
  at matched quality. Report every workload, spread and any regression; do not hide slow classes
  behind an aggregate or redefine the suite after observing results.
- [ ] Identical successful repeat exports avoid capture, and supported incremental edits match
  fresh renders while reusing unaffected work.
- [ ] Users can hear a mix, inspect exact frames, select ranges and manage exports without Studio.
- [ ] Capture, encoding, resource and fallback decisions appear in diagnostics; unsupported options
  fail before expensive work with a useful alternative.
- [ ] Documentation distinguishes qualified offline support, experimental paths and live hardware
  limits. The default migration has a documented compatibility/rollback path.

The 30% target can be revised through an explicit roadmap decision if measurements justify a
different objective. It must not be described as achieved without evidence. Extra codecs and
broader live hardware support can ship independently after the core replacement criteria.

## Validation and starting commands

Use the existing harnesses before adding new ones. Run `vp run demo-assets` if demo audio is
missing. Keep experiment output in ignored output directories and leave source assets unchanged.

```sh
vp run ready
vp run export-acceptance --out examples/demo/out/remotion-reference
vp run export-acceptance --adapter ./packages/renderer-browser/src/export/index.ts --out examples/demo/out/browser-acceptance
node packages/renderer-browser/bench/frames.ts
node packages/renderer-browser/bench/resume.ts
vp run package-smoke --browser
node packages/renderer-browser/bench/export.ts examples/demo --seconds 10 --at 30 --concurrency 2 --out examples/demo/out/browser-profile
vp run render-bench examples/demo --from 30 --seconds 10 --concurrency 2 --variant baseline --repeat 3 --out examples/demo/out/remotion-profile
```

These last two commands are starting points, not a complete fair-comparison harness: their
timing boundaries and setup reuse differ. Phase 0 must align them and include both the actual
Setcast chunk path and current upstream paths. Use fresh output directories and preserve reports.
Follow [endurance.md](endurance.md) for versioned long workloads and decoded verification.

For production capture/readiness/media changes, run both exporter acceptance suites and the
same-page frame checks. Extend resume, GPU, preview and installed-package checks when their
contracts change. Run `vp run ready` before committing. Benchmark timing must be separate from
concurrent validation; a successful unit suite cannot establish capture quality or speed.

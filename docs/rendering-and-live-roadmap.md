# Rendering and live performance roadmap

Setcast will support both a filmed DJ backdrop and direct projection from mixer audio. Keep
Remotion as the default exporter while the independent renderer gains coverage and performance.
Live and offline output share scene components, audio features and explicit time. Operator actions
must survive in the session journal so a recorded master can reproduce the performance.

## Delivery order

1. **Live performance controls and replay.** Add visual intensity, master brightness and blackout,
   smooth timestamped changes, a scene bank, beat-aligned transitions and MIDI mapping. Preserve
   one capture owner. Keep input gain separate from visual intensity. Record effective actions,
   including transition timing, instead of relying on browser animation state.
2. **Exporter measurements and recovery.** Measure decode, frame preparation, capture, encoding
   and memory separately. Preserve verified chunks for resume using a manifest identifying source
   assets, configuration and renderer versions. Optimize the measured bottleneck.
3. **Output setup and reliability.** Select a display, recover fullscreen, retain operator controls,
   report input loss privately and use a deliberate output fallback. Add four-corner projection
   correction, masks, crop and saved venue configurations before multi-projector blending.
4. **Deterministic GPU visualizers.** Add shader fields, particles and large geometric patterns as
   visualizer plugins. Keep CSS typography. Derive motion from explicit time/audio/seed; simulations
   need deterministic replay or checkpoints. Preserve random-access offline frames.
5. **Musical automation.** Curated scene progression with minimum dwell and phrase-aligned changes;
   sustained energy changes influence selection. Beat tracking needs confidence and tap override.
   A stereo master does not reliably reveal track identity or future drops.
6. **Independent preview and wider qualification.** Frame stepping, audio-feature inspection,
   readiness diagnostics and reference-image comparison. Qualify Linux, Windows, longer real
   projects, physical mixers, cameras and OBS. Reduce live effect complexity under load without
   changing the capture clock.

## Filmed DJ backdrop

Use broad shapes and restrained motion, with a configurable quiet region behind the performer.
Keep highlights and overall brightness controlled. Support small branding and a curated,
hands-off scene sequence. Provide camera test patterns and motion samples; refresh/frame-rate
settings cannot by themselves eliminate camera/display banding. A backdrop preset should favor
legibility at a distance over tiny track credits or fine spectrum bars.

## Rave projection

Use large spatial movement and clear geometry. Map bass to scale/depth, mids to density, highs
to detail. Reserve major changes for phrases or operator actions. Provide scene pads, intensity,
brightness, transition length, blackout and hold. MIDI should work without a laptop interaction
for every change. Projection setup starts with one projector, four-corner correction and masks.

## Export optimization decisions

The first two-minute 1080p browser export took about 169 seconds versus Remotion's 144 seconds
on the development machine, with some concurrent local work. This is a comparison, not a
bottleneck diagnosis or a general performance guarantee.

Readiness measurements justified reducing three stable animation-frame callbacks to two, with
font/image decoding inside the stability loop. Preserve video and scene-change correctness.
Hardware encoding helps only when encoding is
a meaningful cost. Shared analysis caching and contiguous worker assignments may reduce repeated
decoding. Capture transport and image compression deserve measurement before a pipeline rewrite.

WebCodecs supplies codec interfaces, not an HTML/CSS scene renderer. Experiment with it first
for a canvas-only visualizer; do not assume it removes DOM screenshot capture.

## First milestone design

Visual thesis: the scene remains the full-canvas focus; performance controls form one compact,
dark operator strip using the existing accent and type.
Content plan: scene recall, intensity/brightness, transition timing, MIDI connection, then
secondary diagnostics and journal controls.
Interaction thesis: frame-driven fades, clear queued/active scene state, immediate blackout;
no decorative UI motion. MIDI changes use the same actions as pointer controls.

Keep scene selection separate from input routing and the global tempo grid. A scene recall must
not restart capture or unexpectedly change the mixer channels. Resolve preparation failures
without replacing a working scene. Journals must remain bounded and ordered under rapid input.

## Verification and completion

For each milestone, record its implemented scope and evidence here. Run `vp run ready`; run
both export acceptance suites for frame/readiness changes. Exercise the actual operator UI,
capture restart, scene failures, MIDI parsing, journal replay and arbitrary frame seeks.
Keep unqualified hardware behavior explicit. Commit coherent completed pieces on master.

### Completed milestone, 2026-10-22

Starting revision: 1d75a94. Implemented:

- Core performance state and absolute-time ramps, visual intensity, composition brightness and
  blackout. The dimmer sits outside theme CSS. Replay preserves interrupted and trimmed ramps;
  ordered automation uses binary search for frame lookup.
- Live scene bank, manual bar-aligned fades through black, readiness failure recovery and MIDI
  defaults/learning. Input capture and MIDI remain owned by the output window. Current tempo,
  routing and performance levels survive scene recall.
- Performance events in the session journal, scene snapshots only after successful preparation,
  separate manual/internal scene directories and bounded cached tail validation for appends.
- Filmed-backdrop and projection examples. Both load and render; their stills were inspected.
- Browser exporter timing metrics and a benchmark command. A 300-frame 1080p slice fell from
  16.86 to 13.40 seconds after the readiness change, with identical decoded frames. This is a
  local 20.5% reduction, not a general throughput guarantee. Direct CDP screenshot capture did
  not improve the first comparison and was not retained.

Validation: `vp run ready` passed all 434 tests, lint/types, dependency checks and smoke render.
Both export acceptance suites passed, including brightness/blackout and out-of-order requests.
The direct same-page frame check and installed-package smoke check passed. The performance UI
check passed scene saves/recall, synthetic MIDI, operator transfer, corrupt-artwork recovery and
journal replay. A final 120-second synthetic-input run passed all 16 theme selections, operator
transfer and capture restart, with zero dropped analysis samples and bounded feature caching.
Physical controllers, camera/display interaction and projector routing remain
unqualified. See [live-performance.md](live-performance.md) and
[browser-renderer.md](browser-renderer.md) for commands and limits.

### Completed resume milestone, 2026-10-22

Starting revision: 1872692. Implemented browser-only `render --resume`, including CLI progress
for reused frames and explicit rejection by Remotion. Completed silent chunks use an atomic
manifest beside the output. Project settings, source contents, adapter/bundle code and runtime
identity determine reuse. Chunk checksums reject damaged files; ffprobe validates new chunks
before publication. Missing/invalid chunks render again, and final output replacement stays
atomic. Successful output removes the checkpoints; failure retains completed work.

The checkpoint directory has an exclusive writer lock. An abandoned lock requires checking
the recorded process before manual removal. Resumable jobs reject remote/untracked resources
and require embedded CSS dependencies. Source metadata is rechecked during the job. Checkpoints
are local recovery files, with additional disk and hashing cost. Details and recovery instructions
are in [browser-renderer.md](browser-renderer.md#resume-an-interrupted-export).

Validation: all 437 tests and `vp run ready` passed. Both exporter acceptance suites passed.
Installed-package smoke covers `--resume`. The recovery check reused 30 of 75 frames and
captured the remaining 45, with identical decoded output to an uninterrupted export. A complete
checkpoint set reused all 75 with no new captures. Missing/corrupt chunks and changed
audio/artwork/configuration/encoding rebuilt correctly; source changes during a job and untracked
resources failed explicitly. Relative asset paths were exercised. CI now includes browser
acceptance and recovery; its Linux run has not been executed from this local session.

### Completed GPU field milestone

Starting revision: 9f63697. Implemented the first deterministic GPU visualizer, `field`, ahead of
projector setup at the user's request. It draws broad WebGL 2 contours using explicit seed/time, bounded time phases
and current audio features. CSS supplies color and composition. Configurable resolution bounds
the drawing buffer; no simulation history, new dependency or renderer-specific import is needed.
Remotion stays the default and the visualizer is opt-in.

Both exporters passed repeated stills and exact decoded-frame comparisons between one-worker
and two-worker chunked exports. The browser check passed shuffled/backward seeks, concurrent
fresh capture pages, scene remounts, seed/audio changes, CSS resizing/color, portrait output,
unavailable WebGL and forced context loss. SwiftShader also repeated frames exactly within its
own backend. Synthetic live input advanced and restarted with no
dropped analysis samples. Physical hardware and cross-driver identity remain unqualified.
`vp run ready` passed all 440 tests, lint/types, dependency checks and smoke render;
installed-package smoke with browser export passed too. CI now runs the field check.

The short 1080p capture comparison was about 20 frames/s for field at half/full resolution,
spectrum and radial on the local Apple M1 Pro. This measures capture/readiness overhead too;
it does not establish a GPU speedup or live frame rate. See [gpu-visualizer.md](gpu-visualizer.md)
for configuration, limits and reproducible checks. The runnable preset is `examples/live-field`.

### Completed output reliability milestone

Implemented session display selection through the Window Management API, explicit fullscreen
recovery, private exit/disconnection notices and clean output after unexpected operator closure.
Capture now distinguishes available input from a running but muted track. Input loss defaults
to black with an optional quiet scene; missing packets and interrupted contexts fail explicitly.
Adaptive resolution reduces only the live GPU field under sustained overload, with slower
recovery and an operator override. Audio capture timing and offline resolution remain explicit.

The browser regression uses actual Chromium capture/fullscreen with simulated display inventory,
track events and slow animation callbacks. Physical projector routing and device unplugging
remain unqualified. Four-corner correction, masks and saved venue geometry were completed in the projector milestone below.
See [live-input.md](live-input.md#output-setup-and-recovery) for controls and limits.

Validation: `vp run ready` passed all 445 tests, lint/types, dependency checks and smoke render.
Both exporter acceptance suites passed, including deterministic GPU frames. The output recovery
and existing performance/MIDI/journal browser checks passed. Operator and output screenshots
were inspected; CI now runs the output regression. An initial cache stress-test timeout under
concurrent Chromium load passed when the full validation suite ran alone.

### Completed export optimization milestone

Browser capture now overlaps the next frame with encoder writes, removing the batch barrier
between workers. Buffering stays bounded to one pending capture per worker plus the active
write. Capture failures interrupt pending waits and settle resources before cleanup. Existing
frame assignments, JPEG quality, absolute-time readiness and resume semantics are preserved.

Two 300-frame 1080p comparisons improved from 13.55/14.19 seconds to 10.56/10.48 seconds,
a local 22–26% reduction. All four decoded videos matched exactly. Audio-window preparation and
encoder backpressure were small relative to screenshot/readiness time, so shared analysis
caching, hardware encoding and compression changes remain measurement-driven follow-ups.
See [browser-renderer.md](browser-renderer.md#capture-and-encoding-overlap) and its raw measurements.

Validation: `vp run ready` passed all 450 tests, lint/types, dependency checks and smoke render.
Both exporter acceptance suites, resume recovery and installed-package smoke with browser
export passed. The live output check also verifies that quality changes keep artwork mounted.

### Completed automatic sequence milestone

Implemented ordered saved-scene lists, per-entry dwell, loop, hold/resume and skip. Lists can be
provided in live.yaml, edited in the operator UI and exported. Dwell uses available capture time
after fade-in; input loss and blackout pause it. Manual scene recall takes control. Failed or
cancelled recalls settle explicitly and hold progression; capture restart requires Run again.
Effective scenes and ramps use the existing journal path. Saved snapshots omit sequence settings.

Validation: all 456 tests and `vp run ready` passed. The Chromium sequence check passed dwell,
loop, hold/skip, manual takeover, failed artwork recovery, usable journal snapshots and capture
restart. The existing performance/MIDI/journal check passed and operator screenshots were
inspected. CI now includes the sequence check. Automatic beat tracking and energy-based scene
selection remain follow-ups.

### Completed one-projector milestone

Implemented opt-in four-corner correction, source crop, up to eight fixed output masks, a static
calibration pattern and up to 16 named venue profiles with versioned JSON import/export. YAML
can supply initial geometry. Invalid configurations keep the working output; loading a venue
turns off calibration. Blackout and input-loss fallback cover the pattern.

Geometry stays separate from scenes and journal snapshots. An iframe keeps theme/art measurements
in composition coordinates while its outer transform maps to the projector. Font readiness uses
the iframe document; capture continues in the parent. The direct scene path remains the default.
See [projector-setup.md](projector-setup.md) for alignment, controls and profile storage behavior.

Validation: `vp run ready` passed all 462 tests, lint/types, dependency checks and smoke render.
Both exporter acceptance suites and installed-package smoke with browser export passed. The
Chromium projector check covers GPU motion, unwarped artwork measurements, delayed fonts,
invalid corners, drag/keyboard adjustment, crop/masks, pixel-black calibration blackout, profiles,
scene recall and snapshots. Existing sequence, performance/MIDI/journal and output recovery
checks also pass. Operator and calibration screenshots were inspected. The output test now
scopes artwork upload separately from venue import; CI includes the projector check. Physical
projector alignment and sustained performance remain unqualified.

### Next milestones

1. Renderer qualification on Linux, Windows and longer real projects. Offline display scheduling
   optimization is complete; further optimization should follow profiles of remaining capture
   costs on those workloads.
2. GPU hardware qualification. Measure sustained live GPU load on real machines and drivers;
   particles with accumulated state require deterministic replay or checkpoints. The stateless
   field, tunnel and constellation are complete.
3. Extend projection only after one-projector hardware qualification: curved meshes, color
   matching and multi-projector edge blending are separate work.

Camera test patterns are implemented below; physical camera qualification remains open. Continuous
beat following needs a stronger onset detector and broader real-recording qualification.
No background task or recurring automation is installed.

### Sustained workload tooling

`packages/renderer-browser/bench/endurance.ts` accepts versioned JSON workloads for live input
and browser exports. It streams samples, checkpoints reports, repeats live scenes/announcements
and capture restarts, validates journals and checks exported stream structure. Workloads use
existing live configuration and renderer contracts. See [endurance.md](endurance.md).
This enables longer local and cross-platform qualification; it does not itself establish
physical hardware support or a memory bound for the entire browser process tree.

### Completed camera setup patterns

Core now exports a strict test-pattern schema, versioned settings format and renderer-independent
React component with explicit size, time and brightness. Alignment, grayscale, detail and motion
patterns work in direct output and inside projector correction. The live operator can show/hide,
adjust and transfer settings; live.yaml supplies initial settings without activating output.
Settings belong to output setup and survive scene recall, but do not enter saved scenes or
performance journals. The existing projector alignment control uses the same component.
Brightness, blackout, input-loss fallback, crop and masks still apply. See [camera-setup.md](camera-setup.md).

Validation: 510 tests and `vp run ready` passed. Installed-package smoke with browser export
passed. The camera Chromium check covers static output without input, all four patterns in
landscape and portrait, explicit-time motion, settings transfer, scene recall and projected
blackout. Existing output-recovery and projector checks passed. Pattern and operator images
were inspected. Physical display/camera flicker, exposure and moiré remain unqualified.

## References

- [WebCodecs specification](https://www.w3.org/TR/webcodecs/)
- [Chrome Window Management API](https://developer.chrome.com/docs/capabilities/web-apis/window-management)
- [Resolume projection transformation](https://resolume.com/support/en/output-transformation)

## Implementation record: sequence and one-projector setup

Delivered automatic scene progression, then projector geometry, with separate validation and
commits. Remotion remains the default exporter.

- Sequence: an explicitly started, ordered list of saved scenes with per-scene minimum dwell,
  looping, hold/resume and skip. Dwell uses available capture time and starts after a transition
  completes. Reuse manual bar alignment, fade/readiness and journal paths. Manual scene recall
  takes control; failed recall holds progression. Capture restart requires explicit restart.
  YAML supplies the curated list; the operator can reorder/edit it and export settings.
- Projector: normalized four-corner homography, source crop, rectangular output masks, an explicit
  calibration pattern and named venue profiles with JSON import/export. Geometry belongs to the
  live output session and is excluded from saved scenes/journal replay. Invalid or crossed corners
  are rejected before changing the working output. Brightness, blackout and input-loss fallback
  must cover the test pattern as well as the scene.
- Projected scenes render inside an iframe so theme layout measurements stay in composition
  coordinates while the iframe itself is warped. Font readiness must use that document. Keep the
  existing direct scene path when projection is disabled. Capture stays in the parent window.
- Visual thesis: retain the dark, compact operator workspace and one accent. Content: sequence
  actions and ordered rows beside the bank; projection editor and venue controls in Output setup.
  Interaction: existing frame-driven fades, direct corner adjustment, explicit pattern toggle;
  no decorative animation or calibration controls on the projected image.
- Verification: state-machine and geometry/schema tests, real Chromium operator workflows,
  journal replay, failure/restart behavior, scene/readiness regression, both exporter acceptance
  suites for the document binding, installed packages and `vp run ready`. Physical projector
  alignment and camera behavior remain hardware qualification work.

## Independent preview delivered

`preview --renderer browser` and `renderer: browser` now select a frame inspector independently
of Remotion Studio. It shares the browser export driver, with exact seeking, silent sequential
playback, rendered audio/timeline inspection, readiness diagnostics and local reference-image
comparison. Resolved project inputs reload automatically; invalid edits retain the last valid
project. Remotion remains the default. See [independent preview](independent-preview.md).

The browser bench covers export-frame agreement, backward seeks, video loops, reference import,
reload and recovery. The CLI is exercised with Remotion imports forbidden. Wider platform and
physical hardware qualification remain open; this completes the preview portion of milestone 6.

## Implementation plan: tunnel and constellation

Starting revision: ab73cac. Adds two opt-in WebGL 2 visualizers next to `field`, with the same
frame contract: every draw is a pure function of absolute time, current audio features, seed,
configuration and CSS color. No visualizer keeps simulation state between frames.

- Shared shader canvas. Move context creation, program linking, CSS color readback, bounded
  drawing-buffer size, context-loss errors, disposal and live `renderScale` into one component.
  `field`, `tunnel` and `constellation` supply a fragment shader and their uniforms. Field
  pixels and error wording stay unchanged.
- `tunnel`: a large perspective tunnel of polygon or round rings and wall spokes, for rave
  projection. Bass breathes depth and widens rings, mids light seeded wall panels, highs add
  intermediate detail rings. Travel and spin are reduced on the CPU to bounded phases; ring and
  panel identities use integer hashes with a fixed period, so long sessions keep precision.
- `constellation`: drifting points linked by fading lines in three parallax layers that fly
  toward the viewer, for a filmed backdrop or projection. Points move on bounded orbits of
  integer multiples of CPU-reduced phases. Layer cycles and drift come from absolute time;
  integer hashes (no `sin` hash) choose positions. Bass swells points, mids lengthen links and
  highs twinkle points. An exact 3x3 neighbor search draws every link that crosses a pixel.
- Configuration through `visualizerSchema` with written errors, registration in both registries,
  `.sc-tunnel`/`.sc-constellation` placement in base.css, live presets under `examples/`,
  README and `docs/gpu-visualizer.md`. No theme default changes.
- Verification: motion/schema unit tests; the browser GPU check generalized to all three
  visualizers (random and backward seeks, fresh workers, seed and audio response, CSS
  color/size, portrait, scene remounts, unavailable WebGL, context loss, live input, adaptive
  scale, SwiftShader); export acceptance stills and worker/chunk frame identity for both new
  visualizers in both exporters; capture benchmark; inspected stills under
  `examples/demo/out/gpu-check/`. Physical projectors and cross-driver identity stay unqualified.

### Completed GPU visualizer expansion

`tunnel` and `constellation` are implemented as planned above, on a `ShaderCanvas` shared with
`field`. Live presets: `examples/live-tunnel` (projection) and `examples/live-constellation`
(filmed backdrop with a CSS-masked quiet region). Remotion remains the default exporter, and no
theme default changed. The tunnel's twist turns the whole wall about the center, rather than only
the spokes, because spiralling spokes alone read as unrelated straight lines. Constellation
links are drawn from the twelve neighbor pairs that can cross a pixel; that cut its historical
SwiftShader readiness measurement from 197 to about 70 ms at half-resolution 1080p. The benchmark
now includes screenshot readback because readiness alone does not measure completed drawing;
see [gpu-visualizer.md](gpu-visualizer.md) for the current capture measurements.

Validation: `vp run ready` passed all 474 tests, lint/types, dependency checks and smoke render.
Both exporter acceptance suites passed repeated stills and identical decoded frames between
one- and two-worker chunked exports for all three GPU visualizers. The browser GPU check passed
for each visualizer (seeks, fresh workers, seed/audio/CSS/portrait, scene remounts, missing
WebGL, context loss, SwiftShader order independence) plus stacked live input and capture
restart. The output check verified adaptive resolution on all three canvases. The projection
check and installed-package smoke with browser export passed. Stills, portrait, software and
live preset images under `examples/demo/out/gpu-check/` were inspected. Capture throughput
matched SVG visualizers on the local M1 Pro; see [gpu-visualizer.md](gpu-visualizer.md) for
the measurements. Physical projectors, cameras, sustained GPU load and cross-driver pixel
identity remain unqualified.


## Completed energy-aware scene selection

Opt-in `live.sequence.mode: energy` selects low, medium or high tagged scenes after sustained
smoothed RMS/bass energy and the existing minimum dwell. Hysteresis rejects threshold chatter;
`any` is a fallback, and no match retains the current scene. Ordered progression stays default.
Manual hold/skip, non-looping lists, transition readiness and effective-scene journaling remain
shared with the ordered sequencer. Input loss, routing changes and blackout reset classification.
See [live-performance.md](live-performance.md#energy-aware-scene-selection).

Validation: `vp run ready` passed 479 tests, lint/types, dependency checks and smoke render.
The energy Chromium check passed synthetic live capture, transient rejection, sustained scene
selection, hold/resume, settings export and journal recording. The existing ordered-sequence
check also passed. The operator screenshot was inspected. Physical mixers remain unqualified.

## Completed assisted beat-tracking prototype

Opt-in live analysis estimates BPM, beat phase and evidence with explicit listening/uncertain/
locked states. The operator adopts a locked estimate through the existing tempo and journal
path; speculative estimates never rewrite output. Manual BPM, tap and downbeat controls remain
valid. Analysis retains eight seconds of onset values and reads cheap stereo energy from the
existing PCM ring without additional FFTs. See [live-beat-tracking.md](live-beat-tracking.md).

Synthetic regular percussion locks; half/double-time competition, missing rhythm and unstable
phase prevent adoption. Local recorded D&B excerpts remained uncertain. This is an assisted
prototype, not a qualified continuous follower. Physical mixer timing and musical downbeats
remain unqualified.

Validation: `vp run ready` passed 484 tests, lint/types, dependency checks and smoke render.
Chromium beat capture/adoption/journal/restart and existing performance/MIDI/scene/replay
checks passed. The final operator screenshot was inspected.

### Shared beat-analysis contract

The detector's bounded evidence tracker and window estimator now live in core. Adapters feed
ordered absolute 100 Hz onset samples; the live adapter supplies the existing stereo log-energy
novelty. Estimates expose periodicity, phase concentration and competing-tempo margin for
evaluation. The initial range can be configured with `beatTracking.range` in live.yaml, without
enabling detection or changing scene content. Acceptance thresholds and explicit adoption remain
unchanged. This establishes a common contract for comparing onset methods, not a claim of better
real-music accuracy. See [live-beat-tracking.md](live-beat-tracking.md#core-analysis-contract).

Validation: 515 tests and `vp run ready` passed. Core checks cover clock validation, gaps,
bounded history, configuration isolation and diagnostics. The Chromium beat check passed
configured-range startup, confidence loss, adoption, journaling and restart.

### Beat evaluation workbench

Versioned corpora now compare the shared tracker across stereo energy, three-band and bass-only
onset inputs. Synthetic fixtures have authored grids; file segments can supply partial reference
intervals or remain explicitly unlabeled. Reports distinguish coverage, tempo errors, phase
errors and false locks, retain source hashes and stream observations. Cancellation and short
recordings fail explicitly with retained reports. See [beat-evaluation.md](beat-evaluation.md).

The first corpus exposed half-beat shifts under strong offbeat accents and stale locks after
abrupt tempo changes. Simple filter candidates did not justify replacing the live baseline;
six real-recording segments supplied coverage evidence only. Validation: 520 tests and ready
passed, including metric/decoder/configuration checks and a complete synthetic evaluation.

### Recent beat evidence

Confidence now also requires recent accents to agree with the candidate grid. The unchanged
eight-second estimator can no longer retain a lock solely on old periodicity when current
transients have moved away. The abrupt tempo-change fixture cleared its stale lock at the next
half-second observation, with regular-pulse and four-floor coverage unchanged for the live
energy method. Offbeat ambiguity remains unresolved; accepted output timing still changes only
through the operator. The expanded evaluation corpus covers phase-continuous changes, phase
steps and missing beats. Validation: 521 tests and ready passed; the live beat browser check
passed adoption, confidence loss, journal and capture restart.

## Completed branding and overlays

Starting revision: ac48ad6. `branding:` (setcast.yaml and live.yaml) adds a logo, name, event
and episode label in one of nine frame areas, with size, opacity and visibility, and rotating
messages. `announcements:` adds timed lines; the live operator announces and clears them, and
the journal replays them. Branding belongs to the scene: saved scenes copy the logo, recall and
recorded scenes restore it. Presentation is fade-only and a pure function of frame time. The
logo uses the `Img` wrapper, so both exporters and live output hold frames until it loads. Each
built-in theme sets edge insets so the defaults clear its furniture in landscape and portrait.
Plan and progress: [branding-plan.md](branding-plan.md); usage: [branding.md](branding.md).

Validation: `vp run ready` passed 506 tests, lint/types, dependency checks and smoke render.
Both export acceptance suites passed with a delayed-logo readiness check. The new Chromium
branding check passed operator edits, MIDI, announcements, scene recall, blackout pixels,
projected iframe loading, journal replay and portrait; performance, sequence, projection,
output and energy checks still pass. Installed-package smoke with browser export renders
branding in every theme and in a resumable export. Stills of all 16 themes and live screenshots
were inspected. Physical displays, cameras and projectors remain unqualified for legibility.

A 10-second 1080p demo slice took 10.3/11.4 s without and 11.4/12.4 s with branding through
Remotion, and 17.5/17.6 s against 17.2/17.6 s through the browser exporter, including setup.
The Remotion difference was not investigated; the browser difference is within run-to-run noise.

## Completed offline renderer scheduling optimization

After the branding handoff, profiles identified screenshot capture and display-paced readiness
as the largest costs in the one-worker browser export. Offline Chromium now uses
`--disable-frame-rate-limit`, preserving the existing asset/React readiness checks, JPEG quality,
ordered bounded capture queue, encoding and resume behavior. Live playback and independent
preview are unchanged; Remotion stays default.

One-worker branded CSS, GPU and looping-video exports improved by 22–33% locally. A one-minute
branded export fell from 94.53 to 63.45 seconds. All 3,600 compared decoded frames and captured
JPEG byte totals matched. The single two-worker pair improved only 4.2%; that difference needs
more repetitions. See [renderer-scheduling.md](renderer-scheduling.md) for the matrix, raw
measurements, reproduction and qualification limits.

Both exporter acceptance suites, same-page seeking, resume recovery and installed-package smoke
passed. The SwiftShader benchmark now measures readiness plus screenshot readback; its earlier
readiness-only measurements did not establish completed software rendering throughput.

## Completed bounded GPU recovery and shader authoring API

All three GPU visualizers share a configurable `recoverySeconds` policy (0–15, default 5).
A restored context rebuilds resources and draws the latest explicit frame before releasing
readiness; timeouts fail explicitly. Live capture continues and operator diagnostics stay private.
Scene replacement cancels pending recovery. Core exports the shader canvas and shared schema for
stateless visualizer authors, with a documented frame, uniform, alpha and resource contract.
See [gpu-visualizer.md](gpu-visualizer.md).

Validation: 522 tests and ready passed, both exporter acceptance suites passed, and installed
package smoke verified the public exports. Browser checks exercised repeated restoration of all
three visualizers, unchanged requested pixels, SwiftShader, fail-fast/timeout behavior, unmount
during recovery and simultaneous live loss without dropped samples. The projection check restored
an iframe context; the Remotion check forced loss during the first GPU draw, compared reference
pixels and verified timeout failure. Forced extension events do not qualify real driver resets.

## Completed configuration schema interface

`configurationSchema(kind)` and `setcast schema [kind]` generate draft-2020-12 authoring schemas
for recorded/live projects, visualizers and portable venue/test-pattern settings. Visualizer
alternatives derive from the registry; input shorthand and defaults remain distinct from normalized
runtime output. Local editor association and validation limits are documented in
[configuration-schemas.md](configuration-schemas.md). No schema service or plugin loader is added.

Validation: ready passed 531 tests. Independent Ajv checks compile every schema, validate repository
examples and reject invalid structure/visualizer controls. CLI checks cover JSON stdout outside
projects and invalid arguments. Installed-package smoke passed with the schema command.

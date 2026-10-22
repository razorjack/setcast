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

### Next milestones

1. One-projector setup: four-corner correction, crop/masks, saved venue geometry and a setup pattern.
   Keep output geometry separate from scene appearance and recorded scene events.
2. Curated automatic scene progression with minimum dwell and manual hold. Add confidence-aware
   beat tracking only after the manual tempo path is qualified with real mixer recordings.
3. Further GPU effects and hardware qualification. Measure sustained live GPU load and software
   backends before adding complexity; particles with accumulated state require deterministic
   replay or checkpoints. The first stateless field is complete.

Display selection, camera test patterns, branding, hardware qualification and independent preview
remain in the delivery order above. No background task or recurring automation is installed.

## References

- [WebCodecs specification](https://www.w3.org/TR/webcodecs/)
- [Chrome Window Management API](https://developer.chrome.com/docs/capabilities/web-apis/window-management)
- [Resolume projection transformation](https://resolume.com/support/en/output-transformation)

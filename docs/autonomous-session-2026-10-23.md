# Platform development session, 2026-10-23

Started at 13:35 Europe/Warsaw on master after ecb0f76. Target handoff: about 19:00
(17:00 UTC). Stop starting features at 18:00 and reserve the last hour for validation,
fixes, documentation and commits. Nothing is to be pushed or published.

## Design constraints

Treat features as platform capabilities: explicit configuration, reusable contracts,
renderer independence, documentation and reproducible verification. Keep ordinary implementation
plain; avoid extension frameworks without a concrete consumer. Prefer YAML and CSS customization.
Keep Remotion default. Preserve capture ownership, absolute time, asset readiness, blackout,
projection and journal semantics. Every standalone completed piece gets a commit.

## Work order

1. Configurable endurance tooling. Exercise sustained live input, scene/branding changes,
   capture restart and long exports. Produce machine-readable samples, runtime identity,
   failures and limits. Start a sustained run early. Distinguish browser heap, process memory,
   capture time and wall time. Do not label synthetic local tests hardware qualification.
2. Camera setup patterns. Shared declarative pattern configuration and explicit-time rendering,
   with private live controls, grayscale/highlight steps, motion, detail and framing samples.
   Reuse output protection and projection. Document camera/display limitations and inspect output.
3. Beat-analysis evaluation. Compare bounded multiband onset candidates with the current detector
   using synthetic fixtures and available real recordings. Keep explicit adoption and tap override.
   Ship detector changes only with evidence of better estimates without false locks; evaluation
   tooling is useful independently. No promise of continuous following or detected downbeats.
4. Review all changes, run appropriate baseline/browser/export checks, commit complete pieces,
   record measurements and remaining limits. No unfinished experimental code in the final tree.

## Progress

- Read the current roadmap and repository guide; working tree was clean at session start.
- Existing player check supports long durations, but keeps all samples in memory, changes themes
  only at the start and has no configurable scenario/report contract. Extend the testing capability
  with bounded streaming reports and repeated workloads rather than inventing a product telemetry service.
- Implemented versioned JSON endurance workloads, streaming reports, repeated scene/announcement
  actions and capture restarts with journal validation, plus project-based export measurements
  and ffprobe verification. The short 35-second live run and 10-second export passed. Initial
  live fixture failure was fixed by writing self-contained saved-scene CSS, matching the platform's
  existing scene contract. No production runtime behavior changed.
- Endurance tooling committed as 04bf035; 508 tests and ready passed. SIGTERM retained a
  cancelled report and exited cleanly. Hour-long live run started at about 13:50 Warsaw,
  artifacts examples/demo/out/endurance-live-hour-2026-10-23, process session 56790,
  log /tmp/setcast-endurance-hour.log. It runs the committed bundle while later code changes.

## Camera setup design

- Visual thesis: one full-frame diagnostic image with restrained monochrome geometry and readable
  labels; retain the compact dark operator UI and its existing accent.
- Content plan: explicit show/hide, pattern selection, relevant controls, settings import/export;
  keep the scene and its controls available underneath. No decorative panels or imagery.
- Interaction thesis: static alignment/gray/detail patterns, absolute-time motion sample,
  immediate hide and existing output brightness/blackout. No CSS animation or ornamental motion.
- Platform contract: pure core TestPatternSchema and motion/layout helpers, renderer-independent
  React TestPattern with explicit size/time/brightness. live.yaml testPattern supplies initial
  settings, never automatically activates it. Settings belong to output setup, not scene recall
  or journal replay. Versioned JSON settings transfer reuses the schema.
- Unify the existing projector alignment pattern with this capability. Patterns appear in
  composition coordinates inside the projected iframe, underneath masks and input-loss black.
  Quiet-scene fallback permits setup without input, as it does for projector calibration today.

- Implemented all four patterns, declarative initial settings, versioned settings transfer and
  shared projector alignment. Camera, output and projection browser checks passed; landscape,
  portrait and operator images were inspected. Installed-package smoke passed. Packaging exposed
  benchmark declarations escaping into other packages; a separate benchmark tsconfig fixes this.
  A sandboxed ready attempt could not bind localhost; validation was rerun with localhost access.

## Beat-analysis design

- Evaluate onset extraction separately from tempo/phase acceptance. Keep explicit operator
  adoption, manual tempo and downbeat controls. A larger heuristic score is not accuracy evidence.
- Prefer pure, renderer-independent analysis contracts with bounded history and documented time
  semantics. Synthetic fixtures provide exact labels; unlabeled recordings only provide coverage,
  stability and performance evidence. Compare candidate methods against the existing detector.
- Use the existing real master for longer export qualification after the live hour finishes;
  retain source files unchanged and report concurrent workloads when interpreting timings.
- Extracted the shared core onset-to-evidence tracker and complete-window estimator, with explicit
  clock validation, bounded history and diagnostic scores. Live YAML can configure the initial
  range without enabling detection. Existing energy novelty and adoption rules remain in place.
  Core/adapter tests and the live beat browser check passed; ready passed all 515 tests.
- Core beat capability committed as 8b3a4b4. Added a configurable, streamed evaluation workbench
  with labeled synthetic fixtures and unlabeled file segments. Simple three-band and bass-only
  onset candidates did not justify a live replacement: the break fixture stayed uncertain;
  energy/multiband can lock half a beat off under strong offbeat accents, and all retain some
  stale locks across abrupt tempo changes. Six real 120-second segments had little coverage.
  Next investigate recent phase agreement and spectral novelty without treating coverage as accuracy.
- Evaluation tooling committed as 5972975. Added a conservative recent-phase agreement check:
  it only lowers confidence and does not alter tempo candidates. The original abrupt-change
  fixture's stale locks fell from seven half-second observations to one at the exact change.
  Regular pulses and four-floor energy tracking retained coverage; offbeat ambiguity remains.
  Expanded fixtures cover continuous-phase tempo changes, phase-only changes and missing kicks.
  Ready passed 521 tests and the real Chromium beat/adoption/journal check passed.

## Sustained qualification progress

- Hour-long live run completed at 14:48 Warsaw: passed, 714 samples, 119 scene/announcement
  actions, five capture restarts, six valid journals containing 125 scenes and 119 announcements.
  Dropped samples stayed zero; cache never exceeded 2048; PCM capacity stayed 485100 frames.
  Browser JS heap 19.5–70.8 MB, Node RSS 136.6–426.2 MB (final 174.8 MB), reported FPS 28.5–31
  with median 30. Adaptive scale stayed 1. Concurrent development checks ran during this workload.
  These are observed process metrics, not a total browser/GPU memory bound.
- Started the 3372-second 1080p/30 full-master browser export on clean 5aedace at about 14:48.
  It uses the existing full-mix timeline and hard-linked source assets in a gitignored qualification
  project, with field and branding. Original files are unchanged. Still at 15:30 inspected.
  Workload config /tmp/setcast-endurance-master.json; output examples/demo/out/endurance-export-master-2026-10-23;
  process session 41965; log /tmp/setcast-endurance-master.log. Wait for its final report and inspect
  selected decoded output frames before claiming qualification.
- A bounded FFT experiment compared cached trigonometric coefficients with the current implementation.
  All 128 tested spectra matched exactly; alternating 4000-transform runs suggested a modest CPU
  reduction. Profile artifacts /tmp/setcast-fft-profile.mjs and .json. Measure and validate any
  retained change; audio preparation was not the earlier exporter bottleneck.
- Cached FFT coefficients committed as 382c749 after 256 exact spectrum comparisons, identical
  decoded real-master stills, ready and both exporter acceptance suites. Median transform time
  improved 11.7% locally under concurrent export load; no export throughput claim.
- Spectral onset evaluation now uses a short Hann window, log-frequency buckets and maximum-filter
  novelty. It gained a few unlabeled real locks but lost four-floor coverage, retained offbeat
  errors and did not lock the break fixture. Keep it in the workbench; retain energy in live.
  Stronger novelty alone is insufficient. Next beat work needs labeled music and metrical modeling.

## Next reliability work

The initial feature plan is delivered and sustained export is still running. Use the remaining
development window for bounded WebGL context restoration, a documented limitation of the shared
GPU canvas. Preserve absolute frame time, capture ownership, journals, projection and offline
readiness. Rebuild resources only after browser restoration; hold incomplete export frames and
fail explicitly on timeout. Make the policy configurable and the shared shader component usable
by platform visualizer plugins. Stop starting features at 18:00 as planned.

- Bounded context recovery implemented with shared schema/public ShaderCanvas authoring API.
  Hardware and SwiftShader restoration checks pass for all three visuals, including exact restored
  frame pixels, timeout/fail-fast, unmount, simultaneous live loss and projected iframe recovery.
  Remotion forced loss during first draw also preserves pixels and times out explicitly.
  Ready passed 522 tests, both acceptance suites passed, and package smoke passed.
  Next: reusable repeated-loss endurance action and a longer 1080p recovery workload.
- GPU recovery and shader authoring contract committed as eb3c743. Repeated-loss endurance
  configuration adds a live-only injection policy and a reusable 1080p preset. The 35-second
  combined check passed four recoveries, six scene/announcement actions and two restarts, with
  three valid journals. Ready passed 523 tests. A longer run will start from the committed tree.

- Repeated-loss tooling committed as f4b8ec4. Two-hour 1080p workload started on that clean revision
  at about 15:35 Warsaw; session 63874, /tmp/setcast-endurance-recovery-two-hours.log, artifacts
  examples/demo/out/endurance-gpu-recovery-two-hours-2026-10-23. Expected completion about 17:35.
- Full-master export passed: 101160 frames / 3372 seconds at 1080p30, 2757.3 seconds wall time.
  Full decoder counted all frames; selected stills inspected. Six stereo audio comparisons at
  5/60/930/1686/2400/3368 seconds had zero sample offset at 16 kHz and correlations 0.9976–0.9999.
  Node RSS 223.8–468.3 MB, final 257.9 MB. Concurrent development means this is qualification,
  not an isolated performance benchmark. Detailed artifacts remain in the export workload folder.
- Configuration tooling is the next platform capability: locally generated editor JSON Schemas
  followed by renderer-free project validation. Plan: docs/configuration-tooling-plan.md.
- Schema interface committed as c7a6b87 after ready (531 tests) and package smoke.
- Structured project validation completed with ready (541 tests), package smoke and all seven
  source examples passing. It preserves referenced scene filenames and uses authored paths even
  when filesystem aliases resolve elsewhere. No renderer or full feature decode is started.

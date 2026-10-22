# Live automation, branding and renderer follow-up

Starting revision: 85b825c. Work on master; commit each validated standalone piece. Remotion
remains the default. Do not push or publish.

## Delivery order

1. Energy-aware scene selection. Extend the existing sequence with an opt-in energy mode and
   low/medium/high/any scene tags. Use pre-performance audio features, smoothed energy,
   hysteresis and sustained classification. Preserve dwell, hold/skip, manual takeover,
   input-loss/blackout pause, transition readiness and effective-action journaling. Expose
   classification and configuration in the operator UI and YAML. Ordered sequences stay default.
2. Confidence-aware live beat tracking. Opt-in bounded analysis on the capture clock, with
   explicit listening/locked/uncertain state, confidence and a configurable tempo range.
   Infer beats, never pretend to infer musical downbeats. Keep manual BPM/tap/downbeat override
   authoritative. Do not repeatedly rewrite the active grid on weak or unstable estimates.
   Preserve journal replay by recording accepted effective tempo changes. Test ambiguity,
   silence, tempo changes, input loss/restart and bounded analysis. Qualify with available real
   audio as well as deterministic synthetic signals; state physical-hardware limitations.
3. Launch a top-level T3 thread on the root master checkout using Claude Opus 5.5, effort high,
   to implement branding and overlays. Have it read repository instructions, persist its plan,
   validate and commit standalone pieces, and send its completion handoff to this thread.
   Read and review the handoff before starting renderer optimization.
4. Further renderer optimization. Measure the post-branding renderer on representative CSS,
   artwork/video and GPU scenes. Choose the demonstrated bottleneck. Keep explicit time,
   frame readiness, capture quality, bounded storage, cancellation and resume behavior. Record
   before/after measurements and decoded-frame comparisons. Run both exporter acceptance
   suites and relevant browser/package checks before committing.

## Validation

For each feature run meaningful pure state/schema tests and an actual Chromium operator check.
Run `vp run ready` before each standalone commit. Run both exporter acceptance suites for
shared rendering, media/readiness or replay changes. Inspect operator screenshots. Hardware
mixers, cameras, projectors and cross-platform drivers require separate qualification.

## Progress

- Repository clean at start. Read the existing sequence, capture, performance and tempo paths.
- Energy-aware selection implemented and validated: 479 tests in `vp run ready`, both energy
  and ordered-sequence Chromium checks, inspected operator screenshot.

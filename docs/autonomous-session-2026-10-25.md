# Renderer diagnostics session, 2026-10-25

Started at 06:33 CET. Budget: about 90 minutes, including validation and commits.

The first deliverable is renderer capability reporting and setup diagnostics. Treat these as
platform contracts: applications should be able to inspect support without starting a renderer,
and consume machine checks without parsing terminal prose. Remotion stays the default.

1. Define a versioned, pure capability descriptor, owned by each adapter. Expose it through
   lightweight package entries and `setcast capabilities`. Describe Setcast's supported behavior,
   not every feature of the underlying rendering library.
2. Add `setcast doctor` and adapter diagnostics. Distinguish declared support from observed
   readiness. Check the actual selected browser and encoder, avoid downloads and project edits,
   bound subprocesses, and clean up temporary resources. Optional GPU/WebP/hardware/resume
   failures must not invalidate a working basic export. JSON is a reusable report contract.
3. Verify real probes, failure reports and installed packages. Document fixes, limits and the
   distinction from project validation. Commit each completed piece after `vp run ready`.
4. Consider a small follow-up only after the above is complete. Explicit visualizer loading is
   the next larger platform item, but it must include both exporters, preview/live, packaging,
   schema registration and resource ownership. Do not start a partial implementation to fill time.

Diagnostics establish a small local smoke check. They do not qualify an entire project, sustained
GPU load, physical displays, mixers, codec coverage or cross-driver pixel identity. Keep existing
software-rendering qualification failures visible.

## Progress

- Read the adapter boundaries, CLI command conventions and existing performance/qualification
  records. Browser export uses system FFmpeg; Remotion uses its packaged binaries. PNG/JPEG
  browser stills do not require FFmpeg, and resume additionally requires ffprobe.

- `afc6811`: capability descriptors, lightweight package entries and CLI reports. Ready passed
  573 tests; installed-package smoke passed both renderer descriptors and browser export.
- Diagnostics now execute both installed runtimes. Local results: both passed PNG/JPEG, H.264/AAC
  containers and WebGL 2 on ANGLE Metal / Apple M1 Pro. Remotion WebP and VideoToolbox passed;
  system FFmpeg 9.0.2 lacks libwebp, so browser WebP is correctly unavailable while video and
  resume prerequisites pass. No installations or default changes were made.

- Follow-up chosen: renderer compatibility during project validation. Reuse the pure descriptor
  to identify settings the selected adapter cannot accept before starting a browser. Keep machine
  readiness (`doctor`) separate, and avoid adding a plugin loader without its full cross-runtime
  and packaging contract in this session.
- Diagnostics validation: ready passed 584 tests; both exporter acceptance suites and installed
  package smoke passed. Tests cover missing executables with no downloads, optional failures,
  timeouts, late browser handles, cleanup, cancellation and JSON/usage behavior. Raw local reports
  are in `examples/demo/out/doctor/`; exporter acceptance artifacts use `doctor-acceptance-*`.

- `3b30d49`: renderer setup diagnostics committed. Both adapters expose the same report/API.
- Compatibility follow-up implemented: pure option checks, renderer selection/checked state in
  validation reports, configured or explicit CLI selection, hardware fallback warnings and tests
  proving neither rendering library is imported. Validation still never rewrites projects.
- Renderer-aware validation passed ready (591 tests) and installed-package smoke for both
  selections. Runtime import blockers prove capability checking stays independent of Remotion
  and Playwright.
- A bounded image experiment found that pinned Chromium's native WebP screenshot at quality 100
  preserves every decoded pixel of a patterned fixture. Next: verify that this can replace the
  browser still export's PNG-to-FFmpeg conversion while preserving its lossless contract. This
  would remove the machine's observed libwebp setup limitation instead of only reporting it.

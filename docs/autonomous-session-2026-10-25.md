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

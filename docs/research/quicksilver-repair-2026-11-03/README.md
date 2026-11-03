# Quicksilver repair investigation, 3 November 2026

The maintained worker harness now reproduces the macOS video regression and exits with status 1.
The source baseline is `380b17b`; no production renderer or theme change accompanies this first
checkpoint. Fixture-only repair experiments continue below as evidence becomes available.

`worker-frames.ts --video` generates a 25 fps, 1.2-second loop and captures frames 30–74 at 30 fps.
It compares exact decoded hashes across requested workers and against the first round. A video
mismatch remains failed even if a subsequent lossless source diagnostic passes. Existing static
art qualification retains its explicit sparse source-rounding allowance. `--size WIDTHxHEIGHT`
selects a landscape size and its portrait counterpart. Dimensions must be even and distinct.
Runtime observations accompany every encoded output; source/options/host identity is retained.

```sh
node packages/renderer-browser/bench/worker-frames.ts --video --theme quicksilver --size 640x360 --repeat 3 --workers 1,2,4 --out NEW_COMPACT_DIRECTORY
node packages/renderer-browser/bench/worker-frames.ts --video --theme quicksilver --repeat 3 --workers 1,2,4 --out NEW_HD_DIRECTORY
```

The recorded control uses one round at 640×360 and 360×640. Landscape passes; portrait fails.
See `maintained-control-report.json`, its lossless source comparisons, runtime observations and
exit status. The full matrices above remain the repair acceptance requirement; a one-round
negative control is sufficient to establish that the maintained harness detects the known bug.

`ready-harness.txt` records passing formatting, lint/types, all 688 tests, dependency isolation
and decoded smoke. Earlier sandbox attempts failed localhost binding; the first approved
experimental launcher then stopped on an existing output directory before launching Chromium.
Their logs are retained. Those environment failures are not renderer outcomes.

Raw outputs live in `examples/demo/out/quicksilver-repair-2026-11-03`. The existing Linux and
macOS reports remain unchanged. Main still defaults to Remotion. No external publication or
hosted CI is part of this work.

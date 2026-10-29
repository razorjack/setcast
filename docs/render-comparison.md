# Comparing installed renderers

`vp run render-compare` measures both installed Setcast adapters with the same timing boundary,
project settings and requested concurrency. It runs sequentially, reverses adapter order on
alternate repetitions, and starts a fresh render session for each export. It does not change
production renderer defaults.

```sh
vp run render-compare examples/demo --at 30 --seconds 6 --repeat 3 --concurrency 2 \
  --out examples/demo/out/comparison-new
```

Use a new output directory. Existing directories are rejected before capture. `--theme` overrides
the project theme for both adapters. Ranges must fit the finite mix; invalid numeric arguments
fail before browser work. Hardware encoding must be disabled and parallel encoding enabled,
because those are the common supported settings. Other encoding options, including profiles,
JPEG quality, CRF/bitrate, chunk duration and graphics selection, come from the project's output
configuration. Source assets and resolved project identity are checked before each run and after
all runs. Self-contained local assets/CSS are required by the reused asset identity helpers.

## Reports and timing

The output directory contains one MP4 per arm/repetition and an atomically replaced `report.json`.
Reports retain completed runs after a later failure. SIGINT/SIGTERM cancels rendering or decoded
verification and records `cancelled`. A failed arm is identified in the report error. Successful
runs report median/minimum/maximum wall times separately for each adapter; no failed run receives
a successful throughput result.

Wall time starts before project loading and includes whole-set analysis, renderer module import,
browser/bundle preparation, rendering, final assembly and render-session cleanup. Input hashing
and output verification are outside that interval. Module/OS caches remain shared in one process;
hashing warms filesystem caches before measurement. These are fresh-session comparisons, not
cold-machine or fully isolated-process benchmarks. `firstFrameProgressSeconds` measures the first
positive frame-progress notification, not a GPU timestamp or physical presentation.

Reports identify the source revision, dirty-tree flag, package versions, requested output settings,
resolved project hash and source-file hashes/stamps. Runtime pins are not observations of the
active browser, graphics driver, encoder or Remotion overlap decision. Instrumenting those actual
decisions remains phase 0 work. Preserve the working patch when retaining a dirty-tree experiment.

Each successful output is fully decoded. Verification checks H.264/AAC stream presence, video
size, frame rate and the expected frame count derived from core range math. A decoded-video hash
is retained for repeatability investigations. Verification is timed separately. It does not
assert pixel equality across browser versions, perceptual quality or source-audio alignment.
Use exporter acceptance and the decoded endurance verifier for those additional contracts.

## Background load and interpretation

The runner samples system CPU busy fraction and Node RSS once a second, retaining sample count,
mean/max CPU usage, initial/final load averages and peak Node RSS. CPU observations include the
renderer and other projects. Load averages describe a longer interval and are not portable CPU
utilization percentages. Node RSS excludes Chromium/FFmpeg and is not process-tree memory.

When another project runs end-to-end tests, retain that context with the report. Do not label a
slow arm a renderer regression on these observations alone. Repeat suspicious pairs during a
quiet interval, with the same settings and a new output directory. Do not selectively drop slow
runs. Run correctness checks separately from performance measurements. The current command does
not detect another project's tests, wait for idle, or attribute system CPU usage to that project.

The initial two-pair, two-second exercise checked both adapter orders and decoded all four
60-frame outputs. A separate SIGTERM exercise retained a cancelled report, an incorrect expected
frame count was rejected, and invalid options/existing output directories failed before capture.
These are harness checks under ordinary workstation load, not performance qualification.

## Remaining benchmark work

This implements the first part of phase 0 in the [replacement plan](renderer-replacement-plan.md).
It compares installed adapters only. Current-upstream isolation, actual capture/GPU/encoder
observations, process-tree resource measurements, controlled background-load attribution, the
full scene matrix, long workloads and matched-quality comparisons remain outstanding. Keep
that scope explicit before using results to decide whether the replacement is faster.

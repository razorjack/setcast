# Capture paint history, 31 October 2026

Status: the repeated one/four-worker theme check passes on macOS arm64, M1 Pro, Playwright 1.64.1
and its pinned Chromium 156.0.8078.4. Two-worker qualification also passes; separate final timing checks are in progress. The source baseline is a7cbe6d with the working changes described below.
No automatic worker policy is promoted by this research alone.

The [earlier worker study](../worker-scaling-2026-10-29/README.md) found decoded differences in
13 of 32 theme/aspect comparisons. Synchronously removing and restoring the body's layout box
reduced those to one case in a complete repeat. The remaining Pirate landscape discrepancy is
one-level source-pixel rounding. Fresh single-worker repeats match; four workers change a few
pixels around transformed DJ panels. Resolved frame inputs and measured DOM state match.

The initial display-toggle candidate failed reliability qualification. A second full run stalled
at Bunker landscape after frame 63 with `page.screenshot: Timeout 30000ms exceeded`; fonts had
loaded. Visibility and transparent-outline invalidation also stalled when applied after readiness.
The unchanged driver passed four Bunker landscape/portrait repetitions (720 captured frames).
Waiting for readiness after outline invalidation passed the same repetitions with identical
hashes. Moving invalidation before the existing readiness check also passed, without extra
callbacks. However, outline invalidation later failed Afterhours source precision (up to two
channel levels). Its improved reliability does not qualify its pixels.

The retained candidate restores the complete display reset, immediately after React commits and
before the two stable callbacks. Body display and priority are restored synchronously; React and
decoded assets remain mounted. It passed all four Bunker repetitions and two complete theme passes in one browser session.
Of 64 comparisons, 62 have identical decoded hashes. Both Pirate landscape comparisons differ
only by one channel level on at most five source pixels per affected frame (frames 52–56).
Fresh single-worker controls match exactly. The separate one/two-worker pass has 31 exact
comparisons out of 32; Pirate landscape differs by one level on at most three pixels. All 96
cases satisfy the predefined precision budget. The checks capture 8,640 encoded frames, plus
lossless fallback captures. These controlled results support the ordering;
Chromium's internal stall mechanism has not been traced. The invalidation cost is included in
`commitMs`; `readinessMs` still measures stable callbacks and assets.

## Precision contract

Keep exact decoded hashes and their `equal` result. When they differ, capture every absolute
frame 30 through 74 as lossless PNG in fresh page groups: one worker twice, then each requested worker count.
The current harness defaults to 1, 2 and 4; the initial reports compare 1 and 4.
Compare decoded RGB for every changed PNG. Allow a maximum absolute channel difference of one
8-bit level on at most `ceil(width * height * 0.00001)` pixels per frame. This is 21 pixels at
1920 by 1080, approximately 0.001% coverage. Every comparison must satisfy the bound.

This explicit precision budget qualifies sparse raster rounding; it does not establish byte
identity. Exact checkpoint, frame-count, timeline, readiness and audio assertions remain intact.
A shifted glyph, missing layer, broad gradient change or larger channel error fails. Lossy
H.264 prediction can propagate tiny source differences across later decoded frames, so an encoded
hash mismatch alone cannot identify the severity or location of the original paint error.
The unit test exercises both the magnitude and coverage rejection boundaries.

## Retained evidence

- `display-before-ready.json` and `display-before-ready.txt`: final repeated one/four-worker qualification.
- `two-workers.json` and `two-workers.txt`: complete one/two-worker qualification.
- `scheduling.json`: automatic four-worker selection, 300-frame repeated-cache reuse and exact
  video/audio recovery after interruption (270 captured, 30 reused).

- `display-complete.json`: all 32 comparisons, 31 exact; Pirate landscape differs.
- `display-stalled-partial.json` and `display-stalled.txt`: the repeated run's failure.
- `visibility-stalled-partial.json`, `visibility-stalled.txt` and `visibility.patch`: rejected candidate.
- `bunker-visibility-stalled.txt` and `bunker-outline-stalled.txt`: isolated failures.
- `bunker-baseline.json`, `bunker-outline-settled.json`, `bunker-outline-before-ready.json` and
  `bunker-display-before-ready.json`: exact passing controls for readiness ordering.
- `outline-before-ready.patch`, `.json` and `.txt`: outline candidate and both complete failed passes, retained for source precision.
- `pirate-one-state.json` and `pirate-four-state.json`: matching frame 52 audio/mix/modulation,
  DOM attributes, geometry and selected computed properties.

Full images/videos are local ignored artifacts under `examples/demo/out/`. The executable
reproducer is `packages/renderer-browser/bench/worker-frames.ts`; `--theme` narrows investigation,
`--workers 1,4` reproduces the original pool comparison, and `--repeat` repeats selected cases
inside one render session. It writes both exact hashes
and any source-precision measurements, retaining all fallback PNGs.

## Mechanism and limits

Chromium invalidates paint when relevant style properties change. This supports investigating
visibility changes without destroying layout objects; it does not establish the root cause of
our screenshot timeout. See the [layout implementation](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/layout/layout_object.cc).

CPU rasterization and additional stable callbacks did not remove Pirate's source rounding.
Changing font positioning was rejected because it changes glyph rendering and layout. See
[Chromium's switch documentation](https://chromium.googlesource.com/chromium/src/+/c46abcfee2e9cc108441ea9fba406548671840ed/ui/gfx/switches.cc).

An upstream [clipped-capture latency regression](https://github.com/microsoft/playwright/issues/43209)
concerns a one-refresh delay with uncapped rendering. It is relevant to later throughput work,
but does not explain a thirty-second stall and is not being cited as its cause.

## Validation

`vp run ready` passes 665 tests in 110 files, formatting, lint, types, dependency isolation and
decoded smoke. Both adapter export acceptance suites pass. Browser frame-driver seeks, audible
preview, marker-fixture resume, installed-package smoke and GPU failure/recovery checks pass.
The scheduling fixture proves that automatic selection and the equivalent explicit worker count
share cache identity, and that cancellation preserves the destination before exact recovery.

One CLI cache unit test exceeded its five-second timeout while multiple correctness suites ran
concurrently. It passed again when ready ran after the browser workloads finished. That failed
run remains recorded in the development log. GPU-harness timing samples collected during
concurrent correctness work are excluded from performance evidence.

# Parent-layer candidate

The scoped Quicksilver repair passes the retained macOS correctness checks. It is isolated on
`renderer/quicksilver-layer-candidate` and is not promoted to main: Linux clip stability must
be repeated on the changed layer policy. Main still uses the previously qualified Linux rule
and therefore retains the documented macOS failure. The renderer default remains Remotion.

The old rule promotes each `.sc-bg-img` with `will-change: transform`. The candidate instead
promotes `.sc-bg` when the stage has `data-background='video'`. This keeps the video inside a
composited background layer without applying the hint to every newly decoded image. Static art
retains its prior layer policy. This is an observed repair, not a proof of Chromium's internal
root cause. It changes no decoder, readiness hold, graphics flag, encoder or precision threshold.

## macOS evidence

The host/runtime matches the preceding follow-up: Apple M1 Pro, Darwin arm64, Node 26.7.0,
pinned Chromium 156.0.8078.4 and ANGLE Metal. The source is `5617248` plus `candidate.patch`.
All checks in `candidate/` exit zero:

- Compact video: three rounds in landscape and portrait, 1/2/4 workers, 45 frames per export.
- Full-resolution video: the same matrix at 1920×1080 and 1080×1920.
- Full-resolution static art: the same matrix with the ordinary acceptance artwork.
- Video → image → video: three rounds in both compact orientations, 1/2/4 workers, 90 frames
  per export, crossing per-play background changes at 1.5 and 2.5 seconds.
- All 64 video-frame theme/orientation/fit cases, shuffled seeks, loops and 25-to-30/60 fps.
- Both exporter acceptance suites, including GPU fixtures and failure/cancellation recovery.
- `ready`: all 688 tests, formatting, lint/types, dependency isolation and decoded smoke.
- The demo still at 110.4 seconds was inspected. The orb, chrome type and panel layout remain intact.

All repeated video and static worker outputs match exactly, including comparisons against the
first round. Source-only parent-layer diagnostics also have exact pixels across 135 comparisons.
The sparse source allowance was not used to excuse an encoded-video mismatch. These short
fixtures do not establish long-export resource bounds or Linux/Windows qualification.

## Rejected and alternative experiments

`experiment-summary.json` and the corresponding reports retain every source comparison. Integer
image geometry, no filter, paint containment, and hidden back faces fail. Partial-raster,
zero-copy and legacy screenshot flags fail. Removing the hint passes locally but discards the
known Linux repair. A clip-path hint and image isolation pass the compact source and encoded
checks; they were not selected for wider qualification. Moving the hint to the parent was the
smallest candidate that retained an explicit compositor layer and passed full-resolution checks.

A raw Graphite-disable flag initially passes, but can replace Playwright's other disabled
features. The isolated retry preserves that feature list. Chromium's `SystemInfo` reports GPU
rasterization and compositing enabled in the control, then software/unavailable-software states
with Graphite disabled. That candidate is not a qualified hardware alternative and is rejected.
The first instrumented command-line query failed without `--enable-automation`; its log is kept.
The corrected diagnostic adds that flag only to read runtime state. No launch flag is promoted.

## Linux continuation

Transfer this committed candidate along with main and the browser-first distribution branch.
After inspecting a clean checkout and installing Linux dependencies, run the maintained compact
and full-resolution `--video --theme quicksilver --repeat 3` commands in the report README.
Also run Quicksilver static workers, all-theme `video-frames.ts --image-only`, both exporter
acceptance suites and `ready`, using the Linux runbook's software-backend policy. Do not overwrite
old evidence. The earlier Linux clip failure must stay visible if the parent-layer change brings
it back. Record the actual runtime, source revision and every failure before considering promotion.

The source-switch reproducer is retained in `reproduction/switches.mjs.txt`. Copy it to the same
`examples/demo/out/quicksilver-repair-2026-11-03/` depth and run it with a new output directory and
`control` as its final argument. It generates its own media. Optional `SETCAST_HD=1` selects full
resolution. This checks the candidate as authored, without a diagnostic CSS override.

## Cost measurement status

Two quiet-run attempts stop before rendering because the host remains above the unchanged 15%
pre-run CPU-busy limit for a minute. Both failed reports and load samples are retained. No speed
claim follows from loaded correctness runs, and the optional layer-cost comparison remains
unqualified. A later quiet retry must use a new output directory. This is independent of the
existing unmatched first-export target against tuned Remotion.

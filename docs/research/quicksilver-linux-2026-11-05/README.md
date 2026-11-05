# Linux Quicksilver parent-layer qualification, 5 November 2026

The promoted repair `97d271a` fails Linux qualification on source
`ed05b6deb217cd43ccedfe96b54d468877d56831`. All six compact repeated-video cases fail exact
decoded equality. Five HD cases pass, then the third portrait repetition fails. The compact
source-switch test also fails. Passing static, seek and general exporter checks do not override
these failures. No production code, capture flag or assertion has been changed.

This session follows the focused repair section of [the Linux handoff](../../linux-renderer-qualification.md).
It does not rerun the historical full renderer replacement campaign. The source includes
browser-first promotion and explicit visualizer packages. The checkout started clean; during
checks, only qualification documentation changes. Harness identities therefore report a dirty
tree. The retained initial diff and final source hashes distinguish documentation from runtime
implementation.

## Host and execution

Fedora 44 x64, Linux 7.2.15-200.fc44.x86_64, Ryzen 9 5950X (32 logical CPUs), approximately
64 GiB RAM, Node 26.7.0, Vite+ 0.2.9, pnpm 11.22.0 and FFmpeg 8.1.3. Active exports report
Chromium 156.0.8078.4, JPEG screenshot capture, SwiftShader under shipped `gl: auto`, and
`libx264` with `image2pipe` input. Runtime reports are retained per export. This is software
graphics qualification, not explicit NVIDIA ANGLE qualification.

Frozen-lockfile installation passes with host access. The initial sandbox attempt fails on the
host pnpm store database and registry access; both attempts remain recorded. The suite runs
sequentially with host browser and loopback access. The bounded layer probes overlap part of
the repeated-video suite; they establish correctness observations, not throughput. The first
compact failure precedes those probes. No other project's processes are stopped.

Raw commands, UTC start/end times, exit statuses and generated media live under
`examples/demo/out/quicksilver-linux-2026-11-05`. The retained runner refuses reused command
labels, and every test uses a fresh output directory. These checks are not quiet performance
measurements.

## Repeated-video failure

[Compact report](compact/report.json): three rounds, landscape 640×360 and portrait 360×640,
1/2/4 workers, 45 frames per export. All six cases fail worker equality; later rounds also
fail equality against the first round. The 25 fps source loops while the output runs at 30 fps.
Lossless diagnostics find 35 samples beyond the unchanged source budget, with maximum channel
difference 49. An inspected landscape sample changes pixels within the orb boundary
(bounding box x=251..388, y=111..248). This localizes one observed difference; it does not
prove Chromium's internal cause.

[HD report](hd/report.json): the same matrix at 1920×1080 and 1080×1920. The final portrait
case fails encoded equality, although its subsequent 135 lossless source comparisons are exact.
The two-worker output differs from the one-worker output at absolute frames 50–74; the
four-worker output matches the one-worker output in that group. Retained per-frame hashes
separate decoded pixel differences from container metadata. A later passing source diagnostic
does not override the failed encoded assertion.

[Static report](static/report.json): all six HD static-art cases pass exact decoded equality,
including equality across repetitions. This narrows the observed regression to video in these
fixtures; it does not qualify all possible artwork and dimensions.

## Bounded layer diagnostics

`layers.mjs.txt` applies fixture-only CSS overrides to the current source and runs 135 portrait
lossless comparisons per alternative. Reports and original PNGs are retained:

- Image `will-change: clip-path`, without the parent hint: fails 24 comparisons, maximum 64.
- Image `isolation: isolate`, without the parent hint: fails 17 comparisons, maximum 64.
- Parent hint plus image `will-change: clip-path`: fails two comparisons, maximum 57.
- Previous image `will-change: transform`, without the parent hint: all 135 comparisons are exact.

The previous image hint has a retained [macOS regression](../quicksilver-repair-2026-11-03/README.md).
Its passing Linux source probe is not grounds to restore it. None of these probes establishes
a new cross-platform correction. The current parent-layer policy remains in production, with
this failure documented. A subsequent repair must pass compact/HD encoded repetitions, source
switches and both platforms' existing reproducers without weakening their assertions.

## Other checks and limits

Initial and final `ready` pass all 694 tests, formatting, lint/types, dependency isolation and decoded
H.264/AAC smoke. All-theme seeks pass all 64 cases plus the 60 fps and selector checks. The
video → image → video reproducer passes all six HD groups (three rounds, two orientations,
1/2/4 workers, 90 frames per export). Its compact run fails the first 640×360 group; remaining
groups are not executed because its unchanged assertion stops the script. This passing HD
source-switch result does not supersede the separate HD looping-video failure. Exporter
acceptance passes for browser and optional Remotion 4.0.513 with `--gl swangle`, including
audio pulses within 5 ms, fractional ranges, fonts/art/video, GPU determinism and injected
failure/cancellation recovery. Fresh browser-only installation passes, including a Remotion-free
package inventory, all themes, cache/resume, ProRes, preview/clip/bundle and installed external
visualizer workflows. Fresh optional compatibility installation also passes validation, six decoded export frames
and installed external visualizer pixels. Both package reports retain dependency inventories,
installation lock digests, diagnostics and completed checks.

Windows, explicit NVIDIA ANGLE, full Linux real-master resources, software-live sample loss and
the first-export speed objective remain separate follow-ups. This focused qualification does
not retest or resolve them. No push, publication or hosted CI run occurs.

## Retained evidence

[Command results](checks.json) record each check independently. The suite continues after failures
to complete independent checks; its final shell status is not an aggregate qualification result.
[Artifact hashes](artifacts.json) cover the retained raw logs, reports, PNGs and media. Large
outputs stay in ignored local output; the compact reports, two inspected source PNGs and
reproduction scripts are committed here. [Source hashes](source-identity.json) and the passing
`runtime-source-unchanged` check confirm that runtime source and lockfiles match `ed05b6d`.
The installed runtime inventories are in [browser-only](installed-browser.json) and
[optional compatibility](installed-compatibility.json) reports.

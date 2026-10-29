# Renderer replacement implementation log

This log records observations as work proceeds. Architecture, priorities and release criteria
are in [renderer-replacement-plan.md](renderer-replacement-plan.md). An experiment is not a
supported feature or completed milestone unless explicitly marked as such. Retain failures and
limitations when adding results. Update this file before context handoffs and include it in each
relevant implementation commit.

## Current state, 2026-10-29

The user authorized autonomous implementation through renderer replacement, with a commit for each
coherent validated change. No push or publication is authorized. Another project can run tests on
this machine; repeat suspicious performance measurements when that load stops. Do not stop or
modify that other project.

Remotion remains the default. Phase 0 is partial; the newer-upstream comparison, process-tree
memory, quality matrix and platform qualification remain outstanding. The first direct decoded-canvas
candidate was rejected and archived. Continuous audio overlap is committed. Hardware encoding is
implemented and validated on this Mac; NVENC device qualification remains pending. Do not switch
defaults because a short benchmark is faster.

Completed commits:

- `e7e71a3`: documented the replacement plan and reconciled the roadmap.
- `b06a39f`: added the installed-adapter comparison runner with aligned timing, alternating
  order, input identities, cancellation reports and decoded-output validation.
- `ca34684`: added opt-in `RenderOptions.onRuntime` and version 2 comparison reports.
- `4ae0b24`: archived the rejected decoded-canvas candidate, full evidence and reproducible checks.
- `fbfdd34`: overlapped continuous master-audio encoding with video work and shared cancellation.

## Runtime observations

The integration run in `examples/demo/out/runtime-observation-2026-10-29/report.json` rendered and
fully decoded one second with each adapter. Browser export used Chromium 156.0.8078.4, two capture
workers and streaming libx264. Remotion used Chromium 149.0.7790.0, two workers and image-sequence
libx264. Both WebGL contexts reported ANGLE Metal on Apple M1 Pro. Remotion reported
`parallelEncoding: false` despite parallel encoding being requested. These facts validate the
observer; the short run is not performance qualification.

`onRuntime` probes the active browser only when requested. Remotion uses a temporary page in its
existing browser; browser export probes each capture page. Observation overhead is inside the
comparison timing. WebGL identity is not GPU utilization, and image-sequence input does not reveal
whether separate chunks overlap. FFmpeg stream-copy operations are not reported as encoders.

Validation for `ca34684`: `vp run ready` passed, including 595 tests, ban-check and smoke. Both
Remotion and browser export-acceptance suites passed. Logs are in
`/tmp/setcast-runtime-{ready,remotion-acceptance,browser-acceptance}.log` on this machine.

## Direct decoded video experiment, rejected candidate

The existing implementation obtains a Mediabunny canvas, copies it, encodes a PNG data URL, then
waits for image decoding before capture. The working change draws decoded frames into persistent
canvases in a React layout effect. The decoder retains a one-canvas pool; displayed canvases
receive their own copy before frame acknowledgement. No full-video frame cache is added.

Changing an image to a canvas can alter selectors. The working compatibility check traverses the
document's stylesheet rules, including nested and imported rules. Image/canvas type selectors,
type-order selectors and escaped selectors retain the PNG image path. Unreadable cross-origin
stylesheets also retain it. Class selectors remain usable for direct canvases. This check is
conservative: an unrelated `img` selector can retain PNG conversion for the whole document.

Two discoveries from the first checks:

1. Canvas and image capture are not exactly pixel-identical under Chromium's scaled rendering.
   The first 640×360 sterile-tech cover frame differed by at most 5/255 per RGB channel, with mean
   absolute difference 0.052/255. Its SSIM was 0.999743. Both images were inspected; no elements
   were missing. This does not establish that all themes or sizes are acceptable.
2. Keeping an old image mounted during an asynchronous frame update can make `image.decode()`
   reject when its source changes. The working change keeps canvases mounted, but preserves the
   previous image behavior of hiding images while the frame is held. The source is keyed so a
   replaced decoder is disposed, including an asynchronously opened decoder.

`packages/renderer-browser/bench/video-frames.ts` currently compares both paths for all 16 themes,
landscape/portrait, cover/contain, shuffled seeks and a 25 fps source at 30/60 fps. It retains
per-frame differences and failing images in `examples/demo/out/video-frames`. The exploratory
threshold is maximum channel difference 8, mean absolute difference 0.1 and RMS 0.5, all on a
0–255 scale. These are not approved output tolerances or a reason to ignore visible errors.
Review the complete result before accepting or rejecting the path.

Next: finish this matrix, inspect failures, measure alternating video workloads with
`bench/video-profile.ts`, and verify seeks, loops, source changes, readiness and cleanup.
Neither the optimization nor its speedup has been accepted or committed yet.

## Local workflow details

Use `PATH="$PWD/node_modules/.bin:$PATH" ./node_modules/.bin/vp` in this checkout. The `vp` on PATH
is a mismatched global npm installation and can split the Vitest runner state. Do not change
production code to compensate. Browser/server checks need localhost access outside the execution
sandbox. Run `vp run ready` before implementation commits and both export acceptance suites after
exporter/media/readiness changes.

Do not delete ignored artifacts while investigating failures. Temporary logs and ignored MP4/PNG
reports are local evidence; record conclusions here so later sessions do not depend on those files
still existing.

The first full matrix attempt stopped making progress during pirate image decoding. Process
inspection showed the benchmark's FFmpeg PNG-from-stdin comparison child idle, not a busy renderer
or another project's tests. Stopped only that owned child. The harness now writes comparison PNGs
and decodes files with a 10-second subprocess timeout, and persists partial reports after each
case. This was a test-harness stall; it does not establish a production decoder failure.

The broader matrix found differences substantially larger than the first sample. Escapement
portrait frame 29 reached 134/255 maximum and RMS 1.60/255. Inspection localized differences to
text and thin dial lines as well as the video. Therefore the direct path is not qualified for a
default change. The next isolated test mounts canvases only after decoding, matching the old
image mount/paint lifecycle, to distinguish compositing-history differences from image scaling.
Do not relax the thresholds simply to pass this result.

The complete persistent-canvas matrix finished: 64 theme/shape/fit cases plus one 60 fps case,
325 frame comparisons, 186 exceeding the exploratory tolerance. Pirate and anamorphic took the
conservative image compatibility path. Worst RMS was 2.204/255 (sterile-tech portrait contain,
frame 36). Remounting the canvas after each decode did not fix escapement: 20 of 25 comparisons
still failed, with the same 134/255 maximum on its portrait text/lines. A software-backed display
canvas (`willReadFrequently`) also failed. An image-to-image control is the next check before
attributing these differences solely to the new rendering path.

The image-to-image control passed all 25 escapement/60 fps comparisons. The differences therefore
belong to the canvas change under this harness, not an inherent failure to repeat the reference.
The direct-canvas default is rejected for now. Retain a reproducible patch and its matrix harness
as research, then restore production's PNG image path. Measure the candidate separately so the
next investigation knows whether resolving the fidelity issue is worthwhile. Frame ownership,
selector compatibility and mount lifecycle alone are insufficient to establish identical output.

The first three alternating 1080p30 video pairs also rejected the speed assumption. For a
three-second, 90-frame sterile-tech workload with a 25 fps 1920×1080 looping test pattern and one
worker, median wall time was 7.803 s for canvas and 6.899 s for PNG images. Canvas reduced total
readiness from roughly 4.07 s to 3.83 s but increased screenshot time from about 1.81 s to 2.95 s.
Every output fully decoded with the expected streams and 90 frames. CPU samples include the
renderer and other applications; this is one short workload on this machine. A second alternating
series is running without concurrent validation to check the counterintuitive result.

The repeat series confirmed the slowdown: canvas median 7.819 s, PNG image median 6.967 s.
Canvas was slower in all six paired comparisons across the two series. Production `video.tsx`
was restored to the committed implementation and the selector helper removed from production.
The [research archive](research/video-canvas-2026-10-29/README.md) contains the patch, full fidelity
reports, both profiles, reproduction commands and limitations. The patch applies cleanly with
`git apply --check`. The standalone benchmark TypeScript project passes type checking.

Next implementation: start the one continuous master-audio encode alongside video chunk capture.
Share cancellation between both tasks, await both before assembly, retain atomic output and the
existing rounded range/audio padding semantics. Keep the completed audio inside the job's temporary
directory so a failed/cancelled job cleans it up. Verify both export-acceptance suites, explicit
cancellation/resume checks and the required baseline before committing.

Validation after restoring production: `vp run ready` passed all 595 tests, formatting, lint,
types, ban-check and smoke. Log: `/tmp/setcast-video-research-ready.log`. The retained candidate
fails qualification intentionally; it is archived as a patch and is not active production code.

## Continuous audio overlap, implementation in progress

The working exporter starts video capture and one continuous AAC master encode together. Assembly
runs only after both finish. A failure in either task aborts its sibling and waits for cleanup
before the temporary directory is removed. External cancellation reaches both, and a pre-aborted
job starts neither. Rounded start time, duration, padding, stereo AAC settings and final stream-copy
assembly are unchanged. Resumed video chunks still share one newly encoded continuous soundtrack.

A dedicated track coordinator has tests for concurrent start, waiting for both successes, either
failure cancelling its sibling while waiting for cleanup, and external/pre-start cancellation.
The new `audio-encode` metric is separate from `mux`; historical mux timings included audio encoding
and therefore are not directly comparable to the new mux-only timing.

Audio-overlap validation passed: 599 tests in 100 files, ban-check, smoke, both export-acceptance
suites and the resume integration harness. Resume covered cancelled jobs, corrupt chunks,
changed assets/configuration/encoding, and reuse of all 75 cached frames. Logs are
`/tmp/setcast-tracks-{ready,remotion-acceptance,browser-acceptance,resume}.log`.

A separate 90-frame demo export requested 30.015–33.015 s and retained the shared rounded-range
math. The continuous audio encode completed at 338 ms while video preparation was still running
(zero captured frames); mux completed after all 90 frames at 3.140 s. Full decode/stream checks
passed. This confirms scheduling and metrics, not a measured before/after speedup. The report is
`examples/demo/out/audio-overlap-2026-10-29/report.json`.

Final audio-overlap baseline also passed after simplifying the assembly parameters:
`/tmp/setcast-tracks-ready-final.log`. Production frame rendering remains unchanged.

## Hardware encoding investigation, next

The installed FFmpeg lists `h264_videotoolbox` with `yuv420p` support and `allow_sw` defaulting to
false. The [upstream VideoToolbox source documentation](https://www.ffmpeg.org/doxygen/trunk/videotoolboxenc_8c.html)
confirms that switch. A required-hardware route should set it explicitly and probe a real encode,
not rely on an encoder name being listed. [FFmpeg's NVENC documentation](https://www.ffmpeg.org/ffmpeg-codecs.html#NVENC-encoders)
notes that available options depend on build headers and runtime support depends on GPU/driver;
it also supports system-memory frames. Use the installed encoder help and a bounded actual encode
probe for the supported route. Do not infer device availability from a compiled-in codec.

Audio overlap was committed as `fbfdd34`. Hardware encoding is now being implemented separately.
The working browser adapter selects VideoToolbox on macOS or NVENC on Linux/Windows after a
bounded actual encode probe. `required` fails before capture when the device cannot encode;
`if-possible` falls back to libx264 and reports the reason. The CLI passes project dimensions,
FPS and bitrate into its probe. The adapter repeats selection for library callers and fingerprints
the resolved hardware setting for resume. No automatic mid-export encoder switch is planned.

Hardware uses the existing explicit `videoBitrate` contract. It does not accept x264 presets or
CRF, and VideoToolbox explicitly uses `-allow_sw 0`. Capability reporting declares implementation
support, while `doctor` probes machine availability. Only this Mac can be qualified in the current
session; Linux/Windows NVENC and hardware quality/performance claims remain unqualified.

Hardware progress: the real 1920×1080, 30 fps, 12M VideoToolbox probe succeeded. Eight policy and
argument tests passed, including unsupported platforms, cancellation, preservation of required-mode
failure causes, and explicit rejection of VideoToolbox software fallback. The full hardware export
acceptance suite passed with 18 observed VideoToolbox chunks, including timing, all current themes,
GPU visualizers, pixel repeatability across workers, cancellation and failure cleanup. Log:
`/tmp/setcast-hardware-acceptance.log`. Hardware resume and encoder-change invalidation checks are
running next. No hardware speedup or matched-quality claim is being made from these checks.

Hardware resume passed, including reuse of all 75 completed frames and invalidation after changing
bitrate or switching from VideoToolbox to libx264. The CLI capability descriptor now declares
hardware encoding; it still does not probe devices. Baseline/software acceptance, machine doctor
and installed-package checks are next. Logs: `/tmp/setcast-hardware-resume.log`.

The public browser `doctor --require video,hardwareEncoding --json` reported ready, including an
actual VideoToolbox frame encode. The first baseline run caught an outdated CLI test expectation:
missing tools now mean hardware encoding is `unavailable`, not `unsupported`. Updated that expected
state; the implementation must continue distinguishing declared support from machine availability.
The complete baseline and installed-package checks are being rerun.

Final hardware validation passed: 607 tests in 101 files, formatting/lint/types, ban-check,
smoke, both software export-acceptance suites, the required-VideoToolbox export suite, hardware
resume and the installed-package smoke check. The public doctor reports all features ready on
this Mac. Logs use `/tmp/setcast-hardware-*`. NVENC remains unqualified on real hardware.

For the next upstream comparison, the public npm registry reported Remotion `4.0.539` on
2026-10-29 (`npm view remotion version --json`, run outside this pnpm-managed repository).
Production remains pinned to `4.0.513`. Keep any `4.0.539` installation and Chromium download in
an isolated checkout. Do not disable shared-memory capture merely to reuse an older browser,
and do not change process-wide unhandled-rejection behavior to hide the previously observed
upstream encoder failure. Compare actual runtime decisions and preserve any failure evidence.

The actual CLI also rendered a project configured with required hardware and 12M bitrate. Its
60-frame output fully decoded as H.264/AAC at the expected dimensions/FPS. Evidence:
`examples/demo/out/hardware-cli-2026-10-29`. This checks the project loader, CLI hardware policy,
adapter and final export together, beyond the direct library acceptance harness.

Hardware encoding was committed as `e784714` after all validation above passed.

## Current-upstream qualification, in progress

Created detached worktree `/private/tmp/setcast-remotion-4.0.539-20261029` at `e784714`. Only its
Remotion catalog entries and adapter peer pins are changed from 4.0.513 to 4.0.539 before installing
with pnpm. The main checkout's production pins remain unchanged. Use this checkout's own modules
and pinned browser; do not symlink its renderer dependencies to the production adapter. Source
projects may be shared read-only, but benchmark reports must retain the isolated dirty-tree state,
exact pins and runtime observations. Installation log: `/tmp/setcast-remotion-539-install.log`.

The isolated 4.0.539 dependency install and initial type/lint checks passed. Inspection found that
its shared-memory route feeds FFmpeg with `-f remotionshm`. Therefore browser identity alone must
not label Remotion capture as JPEG. Runtime reporting is being tightened to record FFmpeg's input
format and mark capture unobserved in a browser-only probe. Another observer bug was found: the
first `-vcodec` can select the MJPEG input decoder, not the output encoder. Output codec inspection
now starts after the final input, with dedicated tests for JPEG, shared memory, image sequences and
stream-copy assembly. The same observation patch is copied into the isolated checkout; it changes
no capture, memory heuristics or encoding arguments.

The first isolated 4.0.539 comparison succeeded with its downloaded Chromium 157.0.8080.0.
Remotion reported parallel encoding and FFmpeg `remotionshm` input; browser export used Chromium
156.0.8078.4 and `image2pipe`. Both fully decoded 60 expected frames. The 30.114 s Remotion wall
measurement includes its initial browser download and cold setup, so it is explicitly excluded
from speed conclusions. Report: `examples/demo/out/remotion-539-first-2026-10-29/report.json`.
The current upstream comparison is now a real shared-memory path, unlike the historical
4.0.534 experiment with shared-memory capture disabled and Chromium 149.

The isolated 4.0.539 export-acceptance suite passed: rounded ranges, A/V pulse alignment, media
readiness, theme repeatability, GPU frames across workers/chunks, failed assets and cancellation.
Log: `/tmp/setcast-remotion-539-acceptance.log`. A separate fault-injection harness is testing the
historical invalid-encoder-argument failure in the second one-second chunk under normal Node
rejection policy. Ordinary cancellation alone does not cover that historical failure mechanism.

The first new failure harness did not inject anything: current Remotion's parallel encoder writes
an intermediate `pre-encode` filename, so matching `chunk-1.mp4` was incorrect. Its report explicitly
has `injected: false` and is not evidence about encoder-failure handling. The harness now counts
actual video-encoder commands (excluding stream-copy assembly) and fails the second encode. A new
output directory retains the corrected run separately from the invalid first attempt.

The corrected 4.0.539 injected-failure check passed under Node's normal rejection policy. The
second encoder failed with `FFmpeg closed its Remotion shared-memory ACK pipe with 1 frame(s)
pending.` The caller caught it, the sentinel destination remained intact, and no temporary chunk
directories remained. Evidence: `examples/demo/out/remotion-539-encoder-failure-2/report.json` and
`/tmp/setcast-remotion-539-encoder-failure-2.log`. Do not carry the 4.0.534 crash forward as a claim
about this qualified 4.0.539 shared-memory configuration.

A three-pair, alternating comparison now measures the 90–120 s demo interval at its unchanged
1920×1080/30 fps standard settings and two workers. Remotion's browser is already installed;
no validation suites run concurrently from this session. System load is recorded, but the runner
still lacks process-tree attribution. Output: `examples/demo/out/remotion-539-standard-2026-10-29`.

The three-pair run finished. Browser median was 21.508 s (20.934–21.672), versus 34.011 s
(33.706–36.265) for Remotion 4.0.539; all six outputs decoded to 900 frames. This is one
standard-profile scene at two workers. Files differ substantially in size (browser about 13.65 MB,
Remotion about 8.68 MB), capture transport and browser version. Equal CRF does not establish
equal quality. Do not generalize this result to the replacement's matched-quality speed target.
System CPU samples also lack attribution to the other project.

Read-only inspection found additional committed research in the clean local branch
`prototype/native-capture` at `308b1cc`, including `docs/native-capture-results.md` and
`docs/shared-memory-capture-results.md`. The latter tested Remotion 4.0.535, not today's 4.0.539.
It found named POSIX frame-pool leaks on some injected encoder failures, even when the destination
and temporary-directory checks passed. The current 4.0.539 fault check covers those filesystem
properties and caught errors only; it has not yet checked named shared-memory allocation cleanup.
The harness's success wording is being narrowed accordingly. Do not infer the old leak persists
or that complete cleanup has been qualified without inspecting pool lifetimes.

That branch also records a native HTML-in-canvas/WebCodecs prototype. It did not beat the
practical parallel JPEG baseline at its tested quality settings and rejected per-play backgrounds
because adaptive panel positions differed. It is useful prior evidence, not an independent
production renderer: it still depends on Remotion for browser/bundle/orchestration. Its parallel
benchmark overrides a private memory eligibility helper; do not import that override into the
new fair comparison. Preserve those branch commits and consult their detailed results before
repeating the native experiment.

Runtime-input reporting validation passed: `vp run ready` (610 tests in 102 files), both
export-acceptance suites, and the injected encoder-failure control on installed Remotion 4.0.513.
Logs: `/tmp/setcast-runtime-input-*`. The current-upstream report, fault result and exact isolated
patch are retained in `docs/research/remotion-539-2026-10-29/`. The observation changes do not
change capture or encoding decisions. Next: bounded process-tree measurements, because Node RSS
and aggregate system CPU alone cannot attribute renderer resource use or competing load.

Runtime-input observation and the current-upstream evidence were committed as `5d14808`.
Process-tree monitoring now samples `ps` on macOS/Linux with a two-second subprocess timeout,
one request in flight and no command arguments or process names. It separates sampled renderer
CPU from other visible process CPU and records summed descendant RSS. `ps` is denied inside
this sandbox; that becomes explicit unavailable data, not zero usage. Real monitoring checks
therefore run with the same authorization needed by the browser benchmark. Windows remains
unavailable for this sampler. RSS can double-count shared pages, and CPU deltas miss processes
that start or exit between snapshots. External GPU/VideoToolbox services and OS work cannot be
attributed to another project. These limits must remain in reports and benchmark interpretation.

The process sampler's controlled child test passed (a 128 MiB allocation and busy loop were
observed), and sandbox denial produced null/unavailable measurements. The first actual-export
integration also decoded both 90-frame outputs, but its external CPU peak exceeded the machine's
ten cores. That is a measurement anomaly, not credible instantaneous CPU utilization. Investigation
is required before calling those CPU figures qualified; preserve the report at
`examples/demo/out/process-monitor-integration-2026-10-29/report.json`. Memory samples and frame
verification remain separate observations. No performance decision uses this diagnostic run.

Source inspection found a timestamp-skew mechanism in the first sampler: asynchronous `ps`
collects counters before its callback can run, but the sampler recorded the callback's later
time. Synchronous bundling can delay that callback. The next sample can then show several
seconds of accumulated CPU against a much shorter interval. A separate quiet ten-second counter
check did not reproduce impossible deltas. The sampler now uses bounded synchronous `ps` and
timestamps the midpoint of the call; its brief blocking overhead remains in export wall time.
The first integration report remains invalid for CPU conclusions. A fresh integration run is
checking the corrected sampler. This does not change renderer execution or output settings.

Corrected process sampling passed the controlled child check, the two-adapter integration
(90 fully decoded frames each), and `vp run ready` (614 tests in 103 files). Both the invalid
asynchronous report and corrected report are committed under
`docs/research/process-monitor-2026-10-29/`, along with the child-control measurements. Logs:
`/tmp/setcast-process-monitor-ready-final.log` and `/tmp/setcast-process-monitor-integration-2.log`.
These are harness checks, not timing qualification.

Next implementation decision: persistent reuse starts with opt-in bounded encoded-chunk storage
using the existing complete export identity. Identical successful exports should capture zero
new frames. Any project/settings/runtime change initially invalidates all chunks; narrower edit
dependencies need separate proof. Use a dedicated cache directory, atomic publication, checksums,
a single-writer lock, eviction and inspect/clear operations. Keep interruption checkpoints separate.
A cache hit still validates source identity and re-encodes one continuous master soundtrack; it
does not imply browser-free startup or audio reuse.

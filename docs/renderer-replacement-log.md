# Renderer replacement implementation log

This log records observations as work proceeds. Architecture, priorities and release criteria
are in [renderer-replacement-plan.md](renderer-replacement-plan.md). An experiment is not a
supported feature or completed milestone unless explicitly marked as such. Retain failures and
limitations when adding results. Update this file before context handoffs and include it in each
relevant implementation commit.

## Current state, 2026-11-01

The user authorized autonomous implementation through renderer replacement, with a commit for each
coherent validated change. No push or publication is authorized. Another project can run tests on
this machine; repeat suspicious performance measurements when that load stops. Do not stop or
modify that other project.

Remotion remains the default. Comparison tooling now records active capture/encoding, process-tree
resources and external CPU load. A current-upstream 4.0.539 exercise is retained, but matched-quality
performance across the full suite and platform qualification remain incomplete. The direct decoded-
canvas candidate was rejected. Continuous audio overlap, hardware H.264, bounded persistent chunk
reuse, audible preview, musical navigation and frame ranges are committed. Local preview exports
passed real-browser, installed-package and acceptance checks. Do not change defaults
because a short benchmark is faster.

Completed commits:

- `e7e71a3`: replacement plan and roadmap reconciliation.
- `b06a39f`: aligned installed-adapter comparison runner.
- `ca34684`: active browser and encoding observations.
- `4ae0b24`: rejected decoded-canvas candidate and evidence.
- `fbfdd34`: continuous master-audio encoding overlap.
- `e784714`: probed hardware H.264 encoding.
- `5d14808`: distinguish capture inputs from output encoders.
- `822c175`: process-tree and external-load sampling.
- `1ea84c8`: self-contained benchmark failure-fixture loading.
- `5f7d30f`: validated persistent chunks with bounded cache storage.
- `255d58f`: explicit preview renderer-selection fix.
- `96f2f7d`: audible preview with exact frame inspection.
- `f7ff92e`: musical navigation and inclusive range selection.

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

The persistent-cache implementation is in progress. `render --cache <directory>` uses a dedicated
marked directory, a single writer lock, a 2 GiB default video-byte budget and at most 4096 indexed
chunks. Atomic index/chunk publication and content hashes protect reuse; unrelated files and
unexpected directories are not recursively removed. `cache inspect` and `cache clear` manage only
recognized caches. Oversized chunks are not retained. Cache and output-specific `--resume` are
mutually exclusive initially. The complete existing job identity includes assets, project, ranges,
encoding, concurrency, host and runtime, so all such changes invalidate reuse. This first version
does not implement selective project-edit invalidation. Unit and real-export checks are underway.

The first real persistent-cache acceptance passed. A 75-frame, three-chunk fixture repeated with
zero captured frames, 75 reused frames and zero capture pages. Decoded video and audio hashes
matched the initial export, including chunk joins. A different destination also reused all frames.
Corrupting or deleting one chunk recaptured 30 frames and reused 45. Project, encoder settings,
art and audio changes each invalidated all frames; restoring original inputs reused all 75.
Cancellation after 33 frames preserved the sentinel output and retained one completed chunk;
recovery captured 45/reused 30. Mid-export source changes prevented publication. Clear removed
managed chunks and the next export captured all frames. Evidence:
`examples/demo/out/persistent-cache-2026-10-29/results.json`; log `/tmp/setcast-cache-acceptance.log`.
The first baseline passed 622 tests in 104 files. Additional CLI/diagnostic coverage, both existing
export acceptance suites and installed-package validation are running next.

Installed-package validation exposed two harness issues. The new packed-cache assertion inspected
stdout, but frame progress is intentionally written to stderr; a separate two-process CLI check
confirmed six reused frames and zero new capture. The assertion now checks stderr. Separately,
Remotion's declaration build includes its bench directory. The encoder-failure probe imported CLI
project helpers, causing four generated `.d.ts` files to appear in CLI source and fail the next
format check. The probe now uses the public core/node loader and theme entry point directly; only
those four generated files were removed. Packaging is being repeated before final `ready` so the
check also proves that declaration emission no longer contaminates source files.

Final persistent-cache validation passed: `vp run ready` after packaging (625 tests in 105 files),
both exporter acceptance suites, the dedicated cache fixture, default package smoke and package
smoke with `--browser`. The installed CLI reused all six frames in a separate process, matched
decoded video, and passed cache inspect/clear and doctor checks. No generated declarations remain
in CLI source. The revised public-loader encoder-failure probe also passed. The benchmark loader
fix was committed separately before the cache feature. Retained cache evidence is under
`docs/research/persistent-cache-2026-10-29/`. Cross-platform and disk-exhaustion qualification,
selective edit invalidation, prepared-asset caching and no-browser cache startup remain pending.

Next workflow investigation: the independent inspector currently advances silent frames only.
Its bounded latest-request queue can be reused for audio-clock playback, but it reports completion
only when no newer request is pending. Continuous audio-clock requests could therefore starve
inspection updates even while the iframe paints. Audible preview needs explicit intermediate-frame
reporting, audio cleanup on project reload/retry, and exact settled inspection after pause/seek.
Keep export-driven absolute-frame preparation and bounded media decoding; do not record real-time
playback as an export. This is a design observation, not an implemented preview change.

## Audible independent preview, implemented 2026-10-29

Preview now plays the master audio through the existing finite Transport and requests absolute
frames from the export driver. One active frame plus one latest pending request bounds work when
rendering is slower than playback. The queue can report intermediate completed frames, so the
inspector continues updating under load. Pause and explicit seek settle on the exact requested
frame. Silent sequential inspection remains available, including after playback-media failure.

Audio elements are paused, detached and cleared on project reload and frame retry. The workspace
parent retains the latest requested frame, playback mode and volume across those in-page resets.
A full page reload uses the frame URL and default audio preferences. Continuous playback writes
the URL at most once per second; explicit seek/pause writes immediately. Audio errors and frame
preparation errors remain separate. Home/End on focused selectors and sliders retain their native
control behavior instead of seeking the mix.

Real-browser coverage deliberately slows frame preparation by 120 ms. Audio keeps advancing,
requests skip frames, and pause settles the frame corresponding to the audio clock. Checks also
cover finite end, exact seek, silent playback, active-audio reload and cleanup, preference retention,
media-only 404 recovery, reference overlays, video/background readiness, CLI file watching with
Remotion imports forbidden, and the read-only server. Desktop and narrow screenshots were inspected.
Physical speaker/display latency and audio-device routing are not qualified by these tests.

The expanded end test initially waited only for HTMLMediaElement.ended and timed out with the
preview already paused on its correct final frame. Transport can pause at finite mix duration
before the browser exposes ended. The check now requires paused audio at finite duration (or
native ended) plus the exact last frame. The failed test is retained locally in
`/tmp/setcast-audible-preview-final.log` and
`examples/demo/out/preview-check/audio-end-wait-failure.png`; it was a harness assumption, not a
product fix. Subsequent full checks passed.

A separate CLI bug was discovered: `options.renderer ?? initial.config.renderer === 'browser'`
treats explicit `--renderer remotion` as a truthy string and opens browser preview. Compare the
parenthesized selected renderer with browser. A subprocess regression test covers both configured
defaults and both explicit overrides (six combinations) using stubbed adapter entry points.
This fix is committed separately from audible preview.

Final validation: `vp run ready` passed 627 tests in 106 files, formatting, lint, type checking,
ban-check and the decoded smoke export. Both exporter acceptance suites and installed-package
smoke with `--browser` passed. Final keyboard/playback integration passed. Local logs:
`/tmp/setcast-audible-ready-commit.log`, `/tmp/setcast-audible-preview-keyboard.log`,
`/tmp/setcast-audible-remotion-acceptance.log`, `/tmp/setcast-audible-browser-acceptance.log` and
`/tmp/setcast-audible-package.log`.

Pre-commit review caught an accidental working-copy overwrite of this log with AGENTS.md content.
The committed log was restored in full, then this section reconstructed from retained code,
validation logs and handoff notes. No committed research was lost. Check document diffs as well as
code before committing subsequent work.

Next: musical navigation and range selection, then a narrowly scoped local export-job API with
explicit lifecycle ownership. Audible preview does not yet provide export controls. Current-upstream
matched-quality performance, resource-aware scheduling, selective reuse, distribution independence
and final platform/default migration remain incomplete.

Musical navigation design: keep listing/annotation/scene marks distinct, including ties, and seek
with the existing exact-frame operation. Beat/bar stepping should compute neighboring positions
from tempo spans without allocating every beat in a long mix; saved scenes can change tempo or
remove it. Navigation targets the first frame that reaches a mark. Range selection stores inclusive
frame endpoints. In particular, converting its final exclusive boundary to the audio duration is
incorrect for a partial final frame: 3.1415 seconds at 30 fps includes frame 94, but rounding the
clamped end seconds through resolveFrameRange would exclude it. Export must use `(last + 1) / fps`
and let the existing renderer clip to its finite frame count. This observation precedes implementation.

Musical navigation and range controls are implemented. Named listing/annotation/scene targets
retain ties, previous/next skips the current frame, and scoped annotation labels remain visible.
Beat/bar navigation computes one candidate per tempo span rather than materializing an hour's
beats. It follows scene tempo changes and skips tempo-free spans. Unit comparisons enumerate
independent grids at 24/30/60 fps, 120/174/299 bpm and three offsets; all frames/directions agree.
An initial test caught negative zero at the opening beat; targets now normalize zero.

The actual preview check passed navigation controls, non-frame-aligned beats, inclusive ranges,
crossed endpoint edits, last-frame inclusion and selection retention on reload. Desktop and
390px screenshots were inspected without overflow. The full baseline is running before commit.

Navigation final baseline passed: `vp run ready` completed 656 tests in 107 files, dependency ban,
type/lint/format checks and decoded smoke. Logs: `/tmp/setcast-navigation-ready.log` and
`/tmp/setcast-navigation-browser.log`. No export-driver behavior changed in this piece.

## Local preview export workflow, design before implementation

Keep library preview read-only unless its caller enables exports with a fixed destination root and
trusted encoding settings. CLI preview enables exports under `out/preview`. Requests specify only
revision and inclusive frame bounds, never paths, shell arguments, assets or arbitrary settings.
Use a same-origin bootstrap token and custom-header POSTs with exact origin checks, bounded JSON,
strict payload keys and no CORS. Downloads resolve only completed job IDs inside their job directory.

Keep one active export, at most four waiting jobs and twenty session records. New jobs get unique
reserved directories; resume uses the same output/checkpoints. Freeze project/settings per request,
reject stale revisions, and cancel active/queued work when a valid revision changes or loading fails.
Use existing resumable export identity checks to reject changed input bytes before publication.
Run consecutive queued exports inside withRenderSession; close the session when the queue drains.
Stopping preview cancels jobs and awaits their renderer cleanup before returning. Export files and
interrupted checkpoints survive shutdown; this first queue does not persist its UI history across
server restarts. Continue to offer ordinary CLI resume for those retained destinations.

The first local export workflow check passed. UI-selected frames 32–94 produced 63 decoded frames;
decoded video and audio matched a direct browser export with the same range/settings. Auth checks
rejected foreign origin/Host, missing/wrong tokens, cross-site reads, stale revisions, injected paths,
invalid ranges and oversized bodies without creating jobs. Replacing a completed output with a
symlink outside its job directory made download fail. Cancelling after the first chunk, then resuming,
reused 30 frames. Project updates cancelled active/queued jobs and rejected stale resume/create.
Shutdown retained checkpoints, removed their writer lock and did not publish a partial MP4.
Desktop and 390px UI screenshots were inspected without overflow.

The first HTTP harness run incorrectly tried to override Host through Node fetch; the observed
request retained its normal host and returned 200. A raw node:http request now sends the intended
foreign Host and receives 403. This was a test transport correction. The queue also now retains
reused-frame counts through final mux progress, so completed jobs show their actual reuse.
Evidence: `examples/demo/out/preview-exports-2026-10-29-b/results.json` and
`/tmp/setcast-preview-exports-b.log`. Baseline and existing preview checks passed. Both exporter
acceptance suites and installed-package preview export are being checked next.

Both exporter acceptance suites passed. The first installed-package preview check failed before
running its export: an embedded smoke-script string interpreted a newline escape inside a quoted
JavaScript string. The fixture now uses String.raw; this was packaging-test source generation,
not an installed renderer failure. The complete package smoke is being repeated. The pre-existing
read-only preview and CLI watcher check passed with the opt-in queue, and the baseline passed
660 tests in 108 files. Source review also retained actionable setting hints in HTTP errors and
added a directory-creation diagnostic for known filesystem failures.

Final preview-export verification passed: `vp run ready` after packaging (660 tests in 108 files,
ban-check and decoded smoke), both exporter acceptance suites, packed `package-smoke --browser`,
the existing preview/CLI watcher check and a second export workflow run that uses the actual Cancel
and Resume buttons. That repeat again reused 30 frames. No emitted declarations appeared in CLI
source. Retained reports are under `docs/research/preview-exports-2026-10-29/`; local final logs are
`/tmp/setcast-jobs-ready-final.log`, `/tmp/setcast-jobs-package-final.log`,
`/tmp/setcast-jobs-{browser,remotion}-acceptance.log`, `/tmp/setcast-jobs-cli-preview-final.log`
and `/tmp/setcast-preview-exports-c.log`.

The local Studio replacement workflow is now implemented. The overall renderer replacement is
not complete: matched-quality throughput, automatic resource scheduling, selective edit reuse,
output color qualification and Remotion-free distribution/default migration remain outstanding.

## Color-contract investigation, started 2026-10-29

ffprobe on the retained 900-frame current-upstream pair shows materially different color metadata.
Browser output is `yuvj420p`, full range (`pc`), matrix `bt470bg`, with unspecified transfer and
primaries, despite the encoder command requesting `-pix_fmt yuv420p`. Remotion 4.0.539 output is
`yuv420p`, limited range (`tv`), unspecified matrix, sRGB transfer (`iec61966-2-1`) and BT.709
primaries. Both use left chroma location. These are observations from the existing standard pair,
not proof of a visible color error. Current system FFmpeg is 9.0.2.

Before matched-quality performance claims, test known RGB patches, near-black ramps and fine type
through actual capture, encoding, explicit decode and browser playback. Separate matrix/range
conversion from metadata tagging and transfer-function conversion. Do not assume `-pix_fmt` alone
specifies output range or copy the current Remotion metadata as an unquestionable reference.
FFmpeg documents explicit matrix/range conversion in its scale filter:
https://ffmpeg.org/ffmpeg-filters.html#scale . Remotion documents its color-space option separately:
https://www.remotion.dev/docs/options/color-space . These were checked 2026-10-29; current online
Remotion wording includes 5.0 defaults, so installed 4.0.539 source remains authoritative for its run.

The initial chart probe found a visible saturated-color mismatch in Chromium playback even when
FFmpeg's decoded RGB remained close to the source PNG. A metadata-only candidate explicitly sets
full-range BT.601 matrix, BT.709/sRGB primaries and sRGB transfer on the decoded JPEG frames.
For the 30-frame software chart, its complete decoded RGB hash exactly equals the current output
(`c110868182a57934e552b1bad4196bf4f66457baa6c42d0cdaed0e24cbd19a25`), while playback's solid green
patch changes from [63,251,0] to [0,255,1] for source [0,255,0]. Neutral patches remain close.
This isolates a metadata interpretation issue rather than an altered capture or image transform.

CLI-only color flags did not retain transfer/primaries through the tested FFmpeg scale paths;
setparams on frames did. Matrix/range conversion and genuine sRGB-to-BT.709 transfer conversion
produced distinct results, including lost near-black steps in the latter browser-playback probe.
Do not select a policy from a global score alone. Playwright 1.64.1's installed Chromium launch
switches already force the sRGB color profile, which supports declaring sRGB screenshot primaries
and transfer. Production encoding is still unchanged; actual hardware encoding and moving-theme
validation must precede promotion. Reports are retained under `examples/demo/out/color-contract-2026-10-29{,-b,-c}`.

The metadata-only fix passed both production chart runs: every solid patch center remained within
three RGB channel levels of the source in Chromium playback for software and VideoToolbox. The
software thirty-frame RGB hash still matched the legacy path exactly. Both software/hardware export
acceptance suites passed; hardware observed 18 actual VideoToolbox chunks. A separate check found
the expected range, matrix, primaries and transfer on all sixteen assembled MP4 fixtures. Remotion
acceptance also passed. Images were inspected, including the corrected saturated colors.

Production now declares the screenshot frame properties through a shared adapter filter; it does
not introduce pixel conversion. Software/hardware preflight and browser doctor exercise that filter.
Capture explicitly forces sRGB (already the pinned Playwright default). The persistent-cache suite
and installed-package smoke passed. Research and the exact SDR contract are retained under
`docs/research/color-contract-2026-10-29/` and `docs/renderer-color.md`. A final baseline remains
before committing. NVENC devices, other receiving apps/platforms, HDR and alpha remain unqualified.

Final color baseline passed: 661 tests in 108 files, formatting/lint/types, dependency ban and
fully decoded smoke export (`/tmp/setcast-color-ready.log`). Both exporter acceptance suites,
actual VideoToolbox acceptance, persistent-cache recovery and installed-package checks passed.
The sixteen assembled-output metadata checks and production chart assertions passed. This
completes the current SDR H.264 color correction; broader receiving-app qualification remains open.

## Worker scaling and resource scheduling, started 2026-10-29

Color correction is committed as `c08c0b3`. Before choosing an automatic worker policy, compare
1, 2 and 4 workers on identical input/settings with fresh sessions and rotating order. Retain
full-video decode hashes, process-tree RSS and external CPU observations. Timings include the
render call and session cleanup; project preparation and output verification are excluded, so
these are scaling experiments, not the end-to-end replacement benchmark.

Concurrency currently participates in both cache and checkpoint identity. Calibration must not
silently change a resumed job's schedule or make identical exports miss their cache merely because
host load changed. Any resource estimate must be described as an estimate, not an enforced browser
memory limit. Worker calibration also needs to include encoding contention and expensive scene
moments; screenshot-only microbenchmarks cannot establish the best complete-export setting.

The new scaling harness initially could not resolve @setcast/themes from renderer-browser, which
has no dependency on themes. It now reads the themes source entry directly, without importing CLI
helpers or adding a production dependency. No renderer or asset change resulted from that failed
launch. Production still defaults to one worker pending measurements.

The first nine standard-scene runs all produced the same complete decoded video hash. External
CPU varied materially (roughly 1.1–4.3 mean cores), so retain that exploration without treating its
median as clean evidence. A requested repeat was started before its preceding idle result was
inspected; the idle result showed 69.6% system busy. That repeat was stopped, its first completed
run retained, and the harness now waits for a bounded low-CPU interval before each arm when
--idle-busy is supplied. It does not stop or inspect the other project's commands.

The candidate stable policy uses 1/2/4 workers, half available CPU count, and a quarter of the
host/process memory limit with a conservative per-page raster/decoder estimate. Jobs below 300
frames use one worker, and explicit counts remain supported. It reports the selected schedule and
resolves it before cache/resume identity. This is a selection heuristic, not a hard native-memory
or CPU-thread limit. Per-job calibration remains a candidate only if its total cost beats this
policy; it must not destabilize stored-job identity. The baseline passed 664 tests in 109 files.

The lower-load standard repeat uses --idle-busy .2, which requires a five-second pre-run average
at or below 20% system CPU. Three alternating pairs are being retained. GPU tunnel and looping
25 fps video workloads follow with identical 1080p30 output settings. The initial aborted run is
not relabeled as a quiet measurement. Production default changes remain uncommitted pending the
comparison and cache/resume/export/package verification.

The three lower-load comparisons passed with complete decoded hashes identical within each case:
standard median 9.721 → 6.375 s, GPU tunnel 10.255 → 7.682 s, looping video 21.258 → 11.422 s.
Each uses three alternating one-worker/automatic-four-worker pairs, 300 frames, 1080p30, software
H.264 and fresh sessions. Input loading/verification are excluded; this is not the current-upstream
replacement benchmark. The GPU and video arms waited through load spikes before running. Video
external CPU remained higher with four workers; reports retain that limit rather than attributing
those processes to another project. Peak summed RSS increased, as expected. Retained evidence is
under docs/research/worker-scaling-2026-10-29/.

Automatic cache/resume verification passed: 300 captured initially, zero on successful repeat and
when the selected count was supplied explicitly, then 270 captured/30 reused after cancellation.
Decoded video and audio matched the fresh export. Both adapter acceptance suites passed. CLI
render/clip now report actual capture workers when preparation ends. All-theme moving-frame checks
and packed-package verification are running before the final baseline and commit.

The expanded moving-theme check found decoded differences in thirteen of thirty-two theme/aspect
cases when comparing one and four workers. This prevents treating the three performance fixtures
as full theme qualification. The default change remains uncommitted. A direct-capture investigation
now compares two fresh one-worker runs and a four-worker run before H.264 encoding, retaining each
JPEG and hash. This distinguishes scheduling dependence from independent-page variability and
encoder reference-frame propagation. The failing all-theme outputs are retained rather than hidden
behind an aggregate score. The earlier exact matches remain valid for their named fixtures only.

Direct JPEG capture isolated a paint-history discrepancy. Passe-Partout's two fresh one-worker
runs matched exactly; four workers differed only at absolute frames 32–37. The changed area was
a thin tracklist progress line (x=1408..1783, y=368..383 at 1920×1080), with whole-frame RMS
0.024–0.035 RGB levels and maximum channel differences 3–11 after JPEG. H.264 inter-frame
prediction propagated those small source differences across more decoded frames. Afterhours also
matched between fresh one-worker runs but differed on nine frames with four workers.

A local experiment removes and restores the body's layout box synchronously before capture,
forcing fresh paint without remounting React or discarding decoded assets. It removed every
Passe-Partout captured-frame difference in the experiment. The candidate is now in the shared
export frame driver after readiness, with its cost included in readiness metrics; all themes,
preview/media behavior and throughput must be rechecked. The original pre-repaint timing reports
are retained and cannot be presented as final-policy performance if this fix ships.


## Milestone closeout, 2026-10-29

The user requested wrapping up this milestone without starting another item. The automatic-worker
and full-repaint candidates are not promoted. The expanded comparison found thirteen differing
theme/aspect cases. The repaint candidate made its first thirteen cases exact, then page.screenshot
timed out after thirty seconds at Bunker portrait. Its cause is unisolated. Keep this failed run
visible; do not increase the timeout or relax comparisons merely to declare success.

Both candidates are preserved as applyable patches under docs/research/worker-scaling-2026-10-29/,
along with full/partial reports, direct-capture controls, logs and sample JPEGs. Their production
changes and candidate-only tests were removed from the working implementation. Browser default
concurrency remains one, with manual 1–8 selection. The safe retained code change reports actual
capture-worker counts in CLI render/clip progress. The standalone scaling and capture-investigation
harnesses remain available; the scheduling acceptance harness is inside the candidate patch.

Color correction c08c0b3 is implemented and validated. Automatic scheduling remains pending on
deterministic capture qualification. Matched-quality current-upstream comparisons, selective edit
reuse, Remotion-free distribution/default migration and broader platform/receiving-app qualification
remain pending. The earlier preview/audio/range/export-queue and persistent-cache commits remain
implemented. No new roadmap item was started during closeout.

Final production closeout checks passed: `vp run ready` with 661 tests in 108 files, formatting,
lint, type checks, dependency ban and decoded smoke; packed `package-smoke --browser` also passed
on the exact reverted production state. Logs: `/tmp/setcast-closeout-ready.log` and
`/tmp/setcast-closeout-package.log`. The three policy-only unit tests are retained inside the
experimental patch, which explains the change from the candidate's 664-test count. Both archived
patches pass `git apply --check` against the final production files. The all-theme research failure
and partial repaint timeout remain documented failures, not passing release checks.

## Renderer replacement resumed, 2026-10-31

Resumed at a7cbe6d after the user's instruction to continue to completion. The intervening commits
select software WebGL for headless Remotion acceptance and keep exact checkpoint equality on the
deterministic marker fixture; neither resolves animated-theme paint history. The working tree was
clean. Begin with an isolated Bunker portrait repaint run, then investigate the prior shared-session
screenshot timeout without increasing its timeout or weakening frame comparisons. Continue to
retain performance measurements separately from correctness checks and concurrent project load.

The isolated Bunker portrait repaint run passed: fresh single-worker repeats and four-worker
captures were byte-identical. The full shared-session replay completed all 32 cases without the
prior timeout. Repainting made 31 comparisons exact; Pirate landscape still differed. Direct
Pirate JPEG capture matched between fresh single-worker repeats but differed with four workers
at absolute frames 52 and 56. The timeout remains unreproduced, not explained. Inspect resolved
frame inputs and DOM geometry at frame 52 before treating the remaining difference as raster-only.

Pirate frame 52 has identical resolved audio, mix and modulation, and identical DOM attributes,
computed properties and all 26 element rectangles across capture schedules. The remaining JPEG
differences are small: frame 52 changes 88 pixels (maximum two channel levels, RMS 0.00529), and
frame 56 changes 58 pixels (maximum two, RMS 0.00581). They lie around the transformed DJ panels.
Waiting for two additional stable callbacks after repaint did not remove them; that extra wait
was removed. CPU rasterization is being tested as a diagnostic, not adopted. Do not change font
positioning merely to make comparisons pass: Chromium explicitly documents that its disabling
switch changes glyph sharpness, kerning, hinting and layout:
https://chromium.googlesource.com/chromium/src/+/c46abcfee2e9cc108441ea9fba406548671840ed/ui/gfx/switches.cc .

Lossless PNG inspection narrows the remaining Pirate difference to rounding: one to six pixels
per affected 1920x1080 frame, each differing by exactly one 8-bit channel level. CPU rasterization
did not remove it and was reverted. Frame inputs and measured DOM geometry are identical. Extra
paint callbacks also did not help. Full-repaint qualification must distinguish this bounded source
rounding from the earlier history-dependent gradients/text; encoded hashes amplify tiny source
changes through lossy prediction and are not a sufficient visual severity measure.

Acceptance decision for the next qualification run: retain exact decoded hash results, then
inspect every source PNG when hashes differ. Permit at most one channel level on no more than
0.001% of pixels in a frame (21 pixels at 1080p); reject larger differences. Keep both fresh-page
repeat controls and complete-frame comparisons. This is an explicit source-pixel precision budget,
not a claim of byte identity or a relaxed timeline/readiness/checkpoint rule. Missing content,
visible shifts, accumulated color errors and the earlier large paint differences remain failures.
The bound must hold across all themes/aspects before automatic scheduling is considered.

The repeated full-theme run reproduced the screenshot stall on Bunker landscape with one worker,
after frame 63. Font loading had completed. Both adapter acceptance suites, shared-driver seeks,
preview and exact marker-fixture resume passed. This separates the long theme-session failure
from ordinary readiness/recovery behavior. Do not promote automatic scheduling yet. Next isolate
whether removing layout boxes is necessary for paint invalidation; a visibility change may reset
paint without destroying layout objects. This is a candidate, not an established fix.

The visibility candidate passes the original Passe-Partout direct JPEG reproducer exactly across
fresh single-worker repeats and four workers. It retains layout objects and restores the previous
inline visibility and priority before returning. A two-round all-theme shared-session run is now
checking both pixel precision and the intermittent screenshot stall. The original display-toggle
failure remains retained. Chromium's layout/paint implementation supports visibility-driven paint
invalidation, but that is mechanism evidence, not proof that a particular stall is fixed:
https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/layout/layout_object.cc .

Visibility invalidation also stalled during the first full pass at Bunker portrait. It is not a
reliability fix. Before the stall, all completed comparisons passed the source precision bound;
Long Exposure landscape and Quicksilver portrait had sparse one-level differences. Isolate
repeated Bunker exports next, then compare with the unchanged frame driver. Avoid attributing a
browser stall to unrelated system load without a controlled reproduction.

The isolated Bunker visibility run also stalls, so preceding theme history is not required.
The unchanged-paint control is progressing through repeated landscape/portrait runs. Test a
transparent outline style that is applied and removed synchronously with style/layout flushes:
it invalidates paint without hiding the scene or removing layout boxes. This remains experimental.
No screenshot timeout has been increased and no automatic retry has been added.

The unchanged frame driver passed all four Bunker landscape/portrait repetitions (eight comparisons,
720 captured frames), with exact worker-count hashes. The transparent-outline candidate fixes
Passe-Partout's original direct JPEG discrepancy; its Bunker repetition is running. These controls
support rejecting visibility/display toggles rather than blaming shared-session resource use.

The outline candidate also stalls (Bunker landscape after frame 60), so preserving visibility
alone is insufficient. All three candidates invalidate paint after the original stable callbacks.
Test an additional readiness settlement after invalidation, before capture; the prior extra-callback
experiment only checked Pirate rounding and did not exercise Bunker's reliability reproducer.

Settling readiness after outline invalidation is progressing through the Bunker reproducer without
a stall. The earlier candidates dirtied paint after they had already declared readiness. Move
invalidation immediately after the React commit and before the existing two stable callbacks;
this preserves the readiness contract and avoids an extra pair of callbacks. Re-run Bunker and
all themes on that exact ordering before drawing a reliability conclusion.

Selective-cache design note for the following milestone: announcement text is a plausible first
local edit because `messageAt` reads only the currently displayed announcement. Preserve
announcement positions, times, durations, list length and all other project/asset/runtime identity.
A chunk may omit only text whose display interval cannot intersect any captured frame in that
chunk. Retain active text, index and conservative overlap dependencies; additions, removals or
retiming should initially invalidate the complete job. Keep the existing whole-job identity for
resume and input mutation checks. A separate chunk identity can share the invariant hash, avoiding
re-hashing large project analysis arrays for every chunk. This requires an explicit built-in-only
dependency contract and fresh-versus-incremental frame/audio comparisons; future plugin code may
inspect arbitrary project fields and must invalidate conservatively. This is design, not yet code.

Outline invalidation before readiness passed Bunker but exceeded the predefined source precision
bound in Afterhours landscape: frames 52, 60, 62 and 64 reach two channel levels on a few pixels.
Keep that failure rather than changing the bound. The full display reset previously made
Afterhours exact, so test that reset before readiness using the now-isolated Bunker reproducer.
This distinguishes paint completeness from readiness ordering.

The full display reset before readiness passed four Bunker repetitions in both orientations,
with exact worker hashes. The all-theme two-round qualification is now running. The outline
candidate is retained as rejected for source precision even though its readiness ordering fixed
the isolated Bunker stall. In the retained ordering, synchronous invalidation belongs to commitMs;
readinessMs still measures the stable callbacks and asset waits. No extra callbacks are added.

The final full-reset candidate passed its first complete 32-case theme pass. The repeated pass,
and a separate one-versus-two-worker pass, are running. Automatic scheduling acceptance selected
four workers, captured 300 initial frames, reused all 300 on a repeat and on the equivalent explicit
count, and recovered an interrupted job with 270 captured/30 reused frames. Decoded video and
audio match the fresh reference. Packed browser-package smoke, shared-driver seeking, preview,
marker resume and exporter acceptance pass. GPU failure/recovery checks pass; that harness also
prints timing samples, which ran under concurrent correctness load and are not performance evidence.

Distribution audit note for the later migration: CLI currently requires the Remotion adapter and
re-exports its PreviewOptions type. Make compatibility loading optional with an actionable missing
adapter error, and own the preview option shape outside that dependency. Optional peer installation
must work alongside the CLI: a global CLI cannot assume it can resolve an adapter installed only
inside a project. Document local, global and npx installation forms explicitly. Browser package
smoke currently packs/installs all five packages, so its browser mode must be changed to physically
exclude the Remotion adapter and packages, rather than only blocking imports. Coordinate core
configuration defaults, renderer helper defaults, doctor/capabilities, scaffolds, README, CI and
required dependency traversal. Explicit legacy-only options must still fail with migration advice.
Browser export needs separately provisioned Chromium and system FFmpeg; read-only doctor must not
silently download either. These are audit findings, not completed migration work.

Current upstream was rechecked against https://registry.npmjs.org/remotion/latest on 31 October:
4.0.539 remains latest (integrity sha512-CC97/XczqcJDJq0za0lU/kc7XnOocs8L9ADHFPWPMEXLm2aOxzdy3E0qnNNwqcW6q98JoKovtxc6YHQGZsZY/Q==).
The isolated 4.0.539 comparison environment can therefore be reused for the next comparison;
production remains pinned to 4.0.513 until a separate dependency decision.

Final one/four-worker theme qualification passed both complete shared-session rounds: 64 cases,
5,760 encoded/captured frames, 62 exact decoded hashes. Both Pirate landscape cases have only
one-level differences on one to five source pixels in frames 52–56; fresh single-worker controls
are exact. No capture timeout occurred. The separate one/two-worker run is completing. Reports
and rejected-candidate evidence are retained in docs/research/paint-history-2026-10-31/.

The one/two-worker pass also passed all 32 cases: 31 exact decoded hashes; Pirate landscape has
one-level source differences on at most three pixels per frame. Final ready passed all 665 tests
in 110 files, formatting, lint, types, dependency isolation and decoded smoke. The earlier CLI
cache-test timeout occurred during concurrent suites and did not recur in this sequential check.
All correctness workloads have finished before timing. Fresh one/automatic comparisons now use
three alternating repetitions for standard, tunnel and looping-video fixtures, with a 15% system
CPU busy ceiling over five seconds before each arm. Actual background CPU remains recorded.

The first final-policy timing attempt performed no exports: all twelve five-second pre-run CPU
samples exceeded the 15% threshold (roughly 29–37%). Its empty failed report and log are retained
under docs/research/worker-scaling-2026-10-31/busy-standard.*. Process inspection showed macOS
background services and another project's browser/Ruby workload, not remaining Setcast render jobs.
Wait for a quieter interval instead of using this load for a speed claim.

A second quiet-period attempt also made no exports and is retained as busy-standard-retry.*.
Commit the fully validated paint correction separately. Automatic production integration is
removed for this commit; the updated candidate patch and its successful scheduling acceptance
report are retained. Production concurrency therefore remains one until new timings are usable.
The policy's three unit tests are inside that patch, so the production-only ready count returns
to 662 tests in 109 files. Continue timing qualification after this coherent commit.

Paint correction committed as c3127fd. The automatic policy candidate is reapplied but uncommitted.
A third timing attempt was rejected without rendering, with sustained samples around 97–100% CPU;
busy-standard-retry2.* retains it. Continue independent incremental-cache work while timing is
unusable. Keep timed exports paused until other workloads subside; no default-policy commit yet.

Dependency audit: Branding calls `messageAt(branding, composition.announcements, timeSeconds)`.
Only that component reads announcement text in the built-in export entry. Recorded scene changes
preserve the global announcement list. The new cache scope must preserve all announcement metadata
and list positions, use the exact subtraction-based expiry comparison from messageAt, and limit
local reuse to an explicit audited set of built-in visualizers in the root and scene appearances.
Unknown visualizers retain whole-job identity. Future plugin/custom-entry loading must disable this
optimization until its arbitrary project-field reads have a dependency contract.

Selective announcement reuse passed its integration fixture: a visible edit captured 30 of 75
frames and reused 45; an edit outside the export captured zero; a fractional interval across a
chunk boundary captured 60 and reused 15. Each incremental result exactly matches a fresh decoded
video and continuous soundtrack. The visible edit changes the original video, preventing a vacuous
hidden-text test. Metadata/CSS changes reuse nothing; a changed announcement also invalidates
interruption checkpoints completely. Unknown visualizers retain global identity. The automatic
policy candidate is removed again for this separate cache commit, pending quiet timing evidence.

The selective cache change passes ready (665 tests in 110 files), existing persistent-cache
corruption/input-mutation/interruption checks and browser exporter acceptance. Its retained
frame-count evidence is [incremental-cache-2026-10-31.json](research/incremental-cache-2026-10-31.json).
No wall-time claim is inferred from these correctness runs under concurrent machine load.

The earlier temporary upstream comparison checkout has disappeared; git lists its worktree as
prunable. The committed 4.0.539 trial patch and reports remain intact. Recreate an isolated
comparison environment before using that baseline again; do not assume the old path still exists.

Compatibility exporter acceptance (swangle) and packed-package smoke with browser export/cache
also pass. Logs: `/tmp/setcast-incremental-{ready,cache,acceptance,remotion,package}.log`.
The recreated upstream environment is `/private/tmp/setcast-upstream-539-final`, based on c3127fd
with only Remotion package/catalog pins changed to 4.0.539. A one-second paired warmup completed,
including browser provisioning; those times are excluded from performance conclusions.

Selective cache reuse committed as 584972f. The fourth quiet-period attempt again made no
exports: pre-run busy samples rose from 29–43% to sustained 100%. Retain it as
`worker-scaling-2026-10-31/busy-standard-retry3.*`. The automatic policy candidate is now applied
only in the isolated upstream comparison checkout, keeping production at one worker while
independent CLI migration work proceeds. No machine processes were stopped.

CLI migration preparation removes the PreviewOptions type dependency on the Remotion adapter
and adds a narrow missing-adapter diagnostic. Missing dependencies inside an installed adapter
retain their original errors. This preparation deliberately leaves package dependencies and
default selection unchanged until independent-install qualification is ready.

The first CLI-loader ready run hit the existing five-second limits in preview selection and
cache management during heavy system load. Both failures are retained in
`/tmp/setcast-optional-ready.log`; no timeout was increased. A fresh complete ready run passed
all 667 tests in 111 files, dependency isolation and decoded smoke
(`/tmp/setcast-optional-ready-retry.log`).

Packed CLI/browser smoke also passes after the optional-loader preparation. Remotion remains a
required CLI dependency and the default in this commit; only the compatibility boundary is ready
for a later dependency change. Log: `/tmp/setcast-optional-package.log`.

Quality-tool work in progress: a one-second 1080p30 reference stores lossless FFV1 and verifies
its complete decoded RGB24 hash against a separate hash of every captured PNG. The identical
reference control gives PSNR infinity and SSIM 1 in both the full frame and credits region.
The fixed VMAF v0.6.1 NEG model returns about 97.49 even for identical input, so do not assume
that a perfect reference scores 100. The metric is supplemental to RGB region comparisons.
See the primary [FFmpeg filter documentation](https://ffmpeg.org/ffmpeg-filters.html#libvmaf) and
[Netflix's NEG model notes](https://github.com/Netflix/vmaf/blob/master/resource/doc/models_v0.md).

Initial calibration at seconds 90–91: browser JPEG 95 / CRF 18 has credits RGB SSIM 0.98518;
current Remotion 4.0.539 / CRF 18 has 0.98880. Browser JPEG 100 raises that to 0.98977 and also
improves full-frame RGB PSNR/SSIM. VMAF means are 95.64, 95.80 and 95.65 respectively. This is
one calibration scene, not matched-quality qualification or a speed claim. Production settings
are unchanged. Remotion's current output now declares limited range and sRGB transfer/BT.709
primaries but omits the YCbCr matrix; the metric tool records that and uses FFmpeg's default
matrix interpretation. Receiving applications may interpret missing metadata differently.

The quality harness also rejects a 29-frame video against a 30-frame reference. Erasing the
credits lowers their region SSIM from 1 to 0.000198 while full-frame SSIM remains about 0.903,
confirming why a global score alone is insufficient. Native-size credit crops from reference,
browser 95, Remotion and browser 100 were inspected: content and placement are preserved in
that sampled frame. Exact project/output digests are now being added to prevent comparisons
against a reference from a different resolved scene or a modified encoded file.

Quality-harness identity verification passes for the same resolved project/export. A comparison
report with a different project digest is rejected before scoring. Calibration JSON, per-frame
metrics, identity reports, negative controls and inspected credit crops are retained under
`docs/research/quality-calibration-2026-11-01/`. The short paired runs only exercise tooling;
their times are not performance evidence. Current upstream was rechecked on 1 November local
time: registry version 4.0.539 and integrity are unchanged.

CLI compatibility preparation committed as e2684a2. During quality-tool review, project JSON
alone was insufficient: the same paths can hold different asset bytes, and equal-length ranges
can cover different absolute frames. The final comparison verifies all tracked asset contents,
absolute frame bounds, resolved project and encoded file digest. Separate negative controls for
asset, range and output mismatches are rejected before scoring; both video inputs are rehashed
after scoring. The final successful six-frame content check is retained beside the calibration
records. Production capture/encoding settings and renderer default remain unchanged.

Final quality-tool ready passed all 667 tests in 111 files, formatting/lint/types, dependency
isolation and decoded smoke. Both lossless RGB controls and all identity/mismatch checks passed.
Logs: `/tmp/setcast-quality-{commit-check,final-ready,content-final}.log`. This completes the
measurement-tool milestone, not the broader matched-quality speed qualification.

Quality measurement committed as 979582c. The fifth quiet-period worker attempt performed no
exports; some samples fell to 15.5–17.4%, but none met the unchanged 15% threshold. Its report/log
are retained as `worker-scaling-2026-10-31/busy-standard-retry4.*`.

Browser-first distribution is being prepared on branch `renderer/browser-first-candidate` in
`/private/tmp/setcast-browser-first-candidate`, starting at 979582c. This is an isolated migration
candidate, not promotion of the production default. It can qualify physical Remotion-free
installation and compatibility diagnostics while final timing/platform criteria remain pending.
The main branch remains on Remotion by default. Keep the candidate commits and test results
linked here before any context handoff.

The sixth worker attempt also performed no exports because its pre-run CPU checks stayed above
15%. The isolated distribution candidate now changes configuration/CLI/scaffold defaults, makes
the Remotion adapter an optional peer, and preserves explicit Studio hardware selection. Its
package smoke is being converted from workspace dependency symlinks to a fresh pnpm tarball
installation. Root development tooling pins pnpm and invokes both pnpm and local vp through
Node entry points, avoiding Windows .cmd execution and global-vp ambiguity. This is candidate
work only; package and platform checks have not yet passed.

Browser-first candidate local checks now pass: both adapter acceptance suites, 667 tests,
decoded browser smoke, a fresh browser-only installation with all default commands, and a fresh
installation with the optional Remotion adapter. The final candidate commit is being prepared;
platform CI jobs are implemented but unexecuted. Main retains its existing default.

The one-second quality follow-up found JPEG 100 / CRF 16 meets or exceeds current Remotion
4.0.539 CRF 18 across all measured full/credit-region mean, p05 and minimum PSNR/SSIM and VMAF
NEG scores. The encoded browser file is larger. This identifies settings for broader testing,
not a speed or whole-suite fidelity result. Final project/asset/frame/output identities match;
raw metrics and comparisons are retained in `quality-calibration-2026-11-01/crf16/`.

The browser-first candidate is committed as **755fa71** on branch
`renderer/browser-first-candidate` in `/private/tmp/setcast-browser-first-candidate`. It includes
browser defaults, optional Remotion compatibility, fresh tarball verification, all default
workflow checks, migration/rollback documentation, retained macOS reports, and an unexecuted
Linux/macOS/Windows CI matrix. Both adapter acceptance suites and final ready passed. Do not
merge this candidate merely because its installation checks pass; performance and supported-
platform evidence remain outstanding. Main remains at its existing renderer default.

The seventh final-driver worker attempt admitted four exports after pre-run samples below 15%,
then stopped when later load checks remained busy for a minute. Two one-worker runs took
10.487/10.985 seconds and two automatic-worker runs took 6.798/6.898 seconds. These are partial
runs, not the required three complete pairs; the report status remains failed. All four videos
passed decoded verification. `worker-scaling-2026-10-31/partial-standard-retry6.*` retains the
full report and load history. The candidate automatic policy remains unpromoted.

A portable corpus generator now fixes concrete workloads for the plan's CSS, three GPU, looping
video, editorial/art/branding, portrait, 60 fps, 4K and chunk-boundary categories before their
comparative results. Definitions and constraints are in `research/replacement-corpus-v1.md`.
The long local master remains a separate requirement; no existing workload is silently removed.

All eleven corpus projects generated and passed public project loading, finite timeline and
asset resolution. The generated manifest with exact configs and content digests is retained as
`research/replacement-corpus-v1.json`. No comparative run of these cases has started before this
manifest is frozen. Local free disk is about 14 GiB, so full lossless references should be
processed one case at a time; retain measurements, identities and inspection crops before
removing only newly generated bulk references. Never remove user source media or old evidence.

Corpus/calibration milestone ready passed all 667 tests in 111 files, formatting/lint/types,
Remotion isolation and decoded smoke. Log: `/tmp/setcast-corpus-ready.log`. The frozen corpus
and higher-fidelity calibration are now ready for broader per-case output comparison.

Corpus definitions and calibration evidence committed as 9838b84. A sequential quality
coordinator is now running all frozen cases against current Remotion 4.0.539 with browser
JPEG 100 / CRF 16, one worker per adapter. This pass deliberately excludes performance claims.
It records all metrics and identity checks and bounds disk use by retaining three lossless
reference samples before deleting only each newly generated bulk reference after successful
measurement. Failed cases retain their reference. Logs: `/tmp/setcast-corpus-quality.log`.

Lossless-reference generation exposed a tooling bottleneck: Chromium's normal PNG screenshot
compression dominated the reference process. A separate exact-RGBA experiment compared normal
Playwright PNG against CDP PNG with `optimizeForSpeed: true`. All 120 cases matched exactly:
16 themes x two orientations x three absolute moments, plus field/tunnel/constellation/looping
video x two orientations x three moments. The reference tool now uses this lossless compression
mode and records it in each new manifest. Production screenshots and encoding are unchanged.
The first corpus reference used the original PNG mode; subsequent references use the verified
mode. Every reference still verifies complete source-to-FFV1 decoded RGB equality. Probe timings
ran under shared load and are diagnostic, not replacement performance evidence.

The first complete frozen-corpus case (standard, 300 frames) measured successfully. Browser
JPEG 100 / CRF 16 meets or exceeds current Remotion CRF 18 for every recorded full/credit-region
mean, minimum and p05 metric. Native-size midpoint credit crops were inspected for all three
reference/browser/Remotion images; no missing content or placement difference was observed.
This is one case, not completion of the corpus. Afterhours is in progress. PNG experiment
reports are retained under `research/png-reference-2026-11-01/`.

The corpus coordinator and faster lossless-reference tooling passed final ready: 667 tests,
111 files, lint/types/formatting, dependency isolation and decoded smoke. The ongoing corpus
measurement remains separate from this tooling milestone. Log: `/tmp/setcast-corpus-tools-ready.log`.

## Bitmap-video candidate, 1 November 2026

Isolated from main at aad14cc. The final candidate uses BMP V4 blob URLs and explicit decoder
ownership, retaining the existing image DOM and CSS behavior. The earlier data-URL variant is
archived after slower diagnostic readiness. All 288 theme/orientation/seek/source-switch RGBA
samples match PNG; nine alpha/compositing controls match; all 32 scene instances release URLs
on unmount. A full ten-second source-switch export matches all 300 decoded frames and PCM audio.
See `research/bitmap-video-2026-11-01/README.md` for raw reports and the retained hash-tool stall.

Ready passed 667 tests in 111 files, lint/types/formatting, isolation and decoded smoke. Browser
acceptance, Remotion acceptance with swangle and packed-browser smoke passed. The final hash
helper uses saved files, bounded threads and a 30-second hard timeout. Complete-export quiet
speed and sustained process memory remain unqualified. Do not promote this branch yet.

The 3,000-capture resource follow-up completed with ten repeated source-switch passes, natural
GC, real JPEG capture, JS heap/DOM samples and process-tree RSS. Every sampled ready frame owns
one BMP URL, peak replacement owns two, and close revokes all 3,000. Later heap/RSS fluctuate
without sustained growth within this workload. Reports and the PNG control are retained under
`research/bitmap-video-2026-11-01`. This is not full-master or speed qualification. The final ready
attempt under concurrent quality-analysis load hit cache/preview CLI test timeouts; the failed
log is retained and a sequential rerun is required before committing.

Main also contains the shared commit-readiness correction at 53551f0. This isolated candidate
has not incorporated it yet; integrate it before any future promotion and rerun acceptance.
The user requested completion of this item, commit and stop, so no further tuning or promotion
is authorized in this work period.

Sequential final ready passed with unchanged test limits: 667 tests in 111 files, formatting,
lint/types, dependency isolation and decoded smoke. The resource helper is included in the
benchmark TypeScript project. This closes the resource-check milestone; speed and full-master
qualification remain pending, and the candidate is not promoted.

## Readiness integration, 1 November 2026

The user resumed roadmap completion. This candidate now integrates main 53551f0's shared
ready-state commit hold and decoded art-transition acceptance. The production behavior under
qualification includes that correction; the previous stop instruction is historical. Both
exporter suites, same-page media, package checks and baseline ready must pass before commit.

Readiness integration validation passes: ready, both exporter acceptance suites (Remotion with
swangle), and frame-driver seeks/font/video-loop checks. Installed browser-package smoke passes.
These correctness checks overlapped corpus metrics and provide no throughput evidence.

Corpus standard and Afterhours now complete: all recorded full-frame and text-region mean,
minimum and p05 comparisons meet or exceed current Remotion at the tested settings. The GPU
cases are running. This remains output calibration, not quiet-period performance qualification.

A new isolated video-preparation experiment starts from aad14cc on
`renderer/bitmap-video-candidate` at `/private/tmp/setcast-bitmap-video-candidate`. The earlier
direct-canvas change failed pixel fidelity. This alternative keeps the `<img>` DOM and CSS
behavior and replaces canvas PNG serialization with a BMP V4 data URL containing lossless
32-bit pixels and explicit alpha/sRGB fields. The hypothesis is lower image-encoding cost;
readback, copying, base64 and image decoding remain, and memory may increase. Exact pixels,
alpha handling, arbitrary seeks/loops, bounded resources and complete-export timings must pass
before any production change. This is an unqualified experiment.

The bitmap data-URL candidate preserves exact decoded RGBA across all 288 theme/orientation/
seek/loop samples. Its nine synthetic alpha/compositing checks also match PNG exactly. However,
its diagnostic readiness median was slower than PNG under the same shared-load experiment,
so it is not a speed improvement to retain. Large base64 DOM attribute values are a likely
cost, not an isolated measurement yet. The next variant uses bounded blob URLs to avoid that
representation; it must prove ownership/cleanup as well as the same pixels. The data-URL
source and reports are archived in `research/bitmap-video-2026-11-01/`.

The blob probe stopped after 271 recorded exact frames because its synchronous FFmpeg PNG-hash
child waited indefinitely in a libavformat `read`, with no CPU use. The renderer had already
written Darkroom's next PNG. Decoding that saved file separately succeeded and matched the
baseline hash. The owned FFmpeg child was sampled and killed; the probe then closed its browser.
The partial report and stack sample are retained. Hashing now reads the already-written PNG
file, uses bounded threads and a 30-second hard timeout. The final Darkroom cases are being
retried separately; the first 30 complete scenes had exactly one live bitmap URL per ready
frame, at most two transient allocations, and zero after unmount. Browser acceptance and ready
passed for the candidate. Do not mistake the incomplete probe for complete qualification.

Darkroom's file-hash retry passed all 18 frames and both scene cleanup checks. Combined with
the first 30 complete scenes, the blob variant matches all 288 expected RGBA hashes, keeps
one bitmap URL per ready frame and at most two during replacement, and releases every URL
after all 32 unmounts. Source switching is included using two video paths with identical bytes.
All hash reports and one source-change PNG per theme/orientation remain; other newly generated
matching screenshots were removed to recover disk space. Source media and earlier research
artifacts were not removed. Candidate browser acceptance and ready passed; throughput and
sustained process memory are still unqualified.

The candidate also passes Remotion acceptance and packed-browser smoke. The decoded video
comparison now covers a complete ten-second slice across a source switch, beyond sampled
stills; those exports are correctness checks under load, not performance measurements.

Reference capture now checks free disk before opening Chromium and before every frame, retaining
2 GiB plus two raw frame buffers by default. `--reserve-gib` can increase the reserve. An
intentional 1024 GiB requirement fails before capture with available/required space in the error;
a normal six-frame reference passes full source/decoded RGB equality. This replaces the overly
conservative whole-reference raw-size estimate for future corpus coordinator invocations. The
currently running coordinator retains its original preflight and may require a separate final
chunk-case retry. No image-quality or timing threshold changed.

The full bitmap-video encoded comparison passed: all 300 decoded video frames and decoded PCM
audio match the original PNG path exactly across the ten-second source-switch slice. See
`research/bitmap-video-2026-11-01/README.md`. The isolated branch remains unpromoted until quiet
throughput and sustained memory checks. Nine corpus cases now have numerical reports. Portrait
contains an unusually low Remotion minimum; investigate individual frames before treating its
aggregate metric advantage as release evidence.

Portrait inspection identifies the low score as an entirely black current-Remotion output frame
at offset 90 (absolute frame 3150, 105 seconds), exactly at the play/art change. Its adjacent
frames and the browser output need comparison and a repeat/control before attributing the cause.
This is a content failure, not a compression-quality difference. Preserve the original report
and do not use this failed arm to claim a matched-quality performance advantage.

Bitmap candidate committed as cc10be9 on `renderer/bitmap-video-candidate`; production main
retains PNG. Final ready passed again after the hash-helper hardening. Main's first ready
attempt found formatting in the new reserve flag usage message; formatting was corrected and
the complete required checks are rerunning.

Main reference/probe milestone passed complete ready: 667 tests in 111 files, formatting,
lint/types, dependency isolation and decoded smoke (`/tmp/setcast-main-qualification-ready.log`).
The browser portrait frame at offset 90 contains the expected new art, credits, branding and
announcement; the corresponding current-Remotion frame is black. A three-repeat transition
control is running separately, with no performance claim.

The portrait transition failure reproduced in all three current-Remotion repeats at absolute
frame 3150; all three browser controls contain no black frame. Source inspection found that
`useHoldUntil` releases its adapter hold before React commits ready state, while prepared art
keeps the entire stage hidden until that state is ready. A layout-effect hold until the ready
state commits is being tested in the isolated upstream checkout. This is a hypothesis until
controlled repeats finish. An attempted pause found that the corpus coordinator had already exited. Its final status
and runtime records are being checked before any remaining case runs.

The commit-readiness hold removes the black transition frame in all three controlled repeats;
both browser and current Remotion render all frames with content. The shared hook now retains
a layout-effect hold until matching ready state has committed. This covers prepared art and
other asynchronous wrapper consumers. The isolated comparison checkout was restored afterward
so the remaining original-corpus case uses the original runtime. Regression coverage and both
exporter acceptance suites are next.

The small solid-color transition control passes even without the commit hold, so it is not a
failing-before reproducer. It remains useful all-frame acceptance of prepared-art transitions.
The frozen Afterhours portrait workload is the actual failing-before/passing-after evidence;
all original and corrected repeated reports are retained under `research/art-readiness-2026-11-01`.
Ten-case quality reports, per-frame full metrics, runtime provenance and inspected midpoint
contact sheets are retained under `research/corpus-quality-2026-11-01`.

Both exporter acceptance suites pass with the commit hold, including every synthetic transition
frame, failures, cancellation and recovery. Same-page frame checks pass. The browser decoded
hash is unchanged across all six original/corrected portrait repeats.

Commit-readiness milestone final ready passed: 667 tests in 111 files, lint/types/formatting,
dependency isolation and decoded smoke. Logs: `/tmp/setcast-commit-hold-ready.log`,
`/tmp/setcast-commit-hold-browser-acceptance.log`, `/tmp/setcast-commit-hold-remotion-acceptance.log`
and `/tmp/setcast-commit-hold-frames.log`.

Main commits now include 543bc50 (reference reserve and bitmap evidence), 53551f0 (shared
commit-readiness correction), and e7c4f34 (ten-case quality reports). Bitmap production code
remains isolated at cc10be9. A 3,000-capture PNG/BMP resource comparison is running with repeated
100–110 second seeks and source changes, natural garbage collection, browser heap/DOM counts,
process-tree RSS and explicit bitmap URL ownership. These concurrent runs are not speed tests.

User requested completion of the current item, then commit and stop. Scope is now limited to
closing the in-flight quality/resource milestone: final corpus case, corrected portrait metrics,
3,000-frame PNG/BMP memory probes and final checks. No new performance tuning or promotion.
The BMP resource run completed all 3,000 JPEG captures across repeated source switches, with
one live URL per sampled ready frame, at most two transiently, and all 3,000 URLs revoked on
close. Natural-GC heap/process samples are retained; no complete-export speed claim is made.
Packed-browser smoke for the shared readiness correction also passed.

Both 3,000-capture resource runs passed and closed. Later sampled JS heap and process-tree RSS
fluctuated without sustained growth; all bitmap URLs were revoked. Raw PNG/BMP reports are
retained. The final ready runs overlapped CPU-heavy quality analysis and failed only five-second
CLI subprocess test timeouts (cache on main, cache/preview on candidate). Those logs are retained;
checks will run sequentially after analysis, with unchanged test limits.

The corrected full ten-second portrait comparison passes all numerical quality checks with no
black frames in either output. Its lossless reference RGB hash matches the original reference.
The failed original comparison remains retained; `corpus-quality-2026-11-01/portrait-corrected`
contains the valid quality arm. Only final chunk metrics and sequential final checks remain
before committing and stopping as requested.

Sequential final ready passes on main and the bitmap candidate with unchanged test limits:
667 tests in 111 files, formatting/lint/types, isolation and decoded smoke in each checkout.
The earlier parallel-load timeout logs remain archived. The comparison runtime's final check
is running next, sequentially.

The bitmap resource milestone is committed as 728e2f0 on `renderer/bitmap-video-candidate`
(implementation cc10be9). The current-upstream research runtime is now committed as 6c373c0
on `renderer/upstream-539-comparison`, replacing the previously dirty detached checkout. Its
final ready passed 665 tests in 110 files, lint/types/formatting, isolation and decoded smoke.
No automatic policy or Remotion dependency upgrade was promoted to main. The browser-first
candidate remains clean at 755fa71.

## Stop checkpoint, 1 November 2026

The final chunk-boundary case completed all quality measurements. All eleven frozen cases have
numerical reports at browser JPEG 100 / CRF 16 versus current Remotion CRF 18, one worker each.
The corrected portrait arm removes the original black-frame defect and still meets every
recorded metric comparison. The chunk retry also meets every recorded metric comparison, but its original-code Remotion
arm contains the same black transition at offset 510 (absolute 3150), found by the final frame
scan. Browser has none. A corrected 63-second rerun is pending; this failed arm cannot qualify
matched quality or speed. The user requested stopping after this item, so no new rerun starts.
These are output calibration results under shared load, not throughput evidence or changed
defaults. All original failures remain in the research records.

The current item is finished. Main includes the readiness fix, disk-reserve guard, typed video
resource probe and durable quality/resource findings. The bitmap implementation and resource
evidence remain isolated at `renderer/bitmap-video-candidate` 728e2f0. The browser-first
installation candidate remains at 755fa71, and the exact current-upstream research runtime is
committed as `renderer/upstream-539-comparison` 6c373c0. No further work starts in this period.

Remaining before promotion: repeat the 63-second comparison with the committed readiness fix;
integrate the shared readiness fix into the isolated feature
candidates; run complete quiet alternating worker/video/current-upstream timings; qualify
full-master process memory and supported installed platforms/backends; then integrate the
browser-first distribution with its migration/rollback documentation. Automatic workers and
bitmap video remain unpromoted. The 30% speed target is unproven. Native capture qualification,
prepared-asset/batch reuse and transparent/editing outputs remain planned work as scoped in the
replacement plan. No CI execution, external publication or default switch was performed.

Validation: main and bitmap each pass 667 tests in 111 files plus lint/types/formatting,
isolation and decoded smoke. The upstream snapshot passes 665 tests in 110 files and the same
baseline checks. Both exporter acceptance suites, same-page media checks and packed-browser
smoke pass for the shared readiness correction. Each video resource run completed 3,000 JPEG
captures and closed; all 3,000 bitmap URLs were revoked. Earlier load-related test timeout logs
are retained, followed by successful sequential reruns with unchanged limits.

## Resumed roadmap completion, 1 November 2026

The user resumed autonomous work through the renderer-replacement roadmap. The previous stop
checkpoint is historical. Main begins at 65d78fa; isolated candidates are bitmap 728e2f0,
browser-first 755fa71, and upstream 6c373c0. The corrected 63-second corpus rerun has started
against the committed upstream runtime, with the same frozen inputs and quality settings.
Integrate the shared readiness correction into both feature candidates before further qualification.
Keep timing runs separate from these correctness jobs and preserve the 15% pre-run CPU limit.

### Whole-set preparation reuse

Inspection confirmed that render bundles and clip batches already share analysis and browser
preparation. Preview reloads repeated whole-set decoding after unrelated edits, and all-theme
stills reused only the overview envelope, which could omit travel needed by later themes.
`WholeSetReader` now owns the latest audio source's summaries for one preview or theme batch.
It coalesces concurrent requests, resolves source aliases, checks device/inode/size and nanosecond
modification/change timestamps before and after decoding, evicts failed work, and copies returned
arrays. It retains summaries rather than PCM; retained travel still scales with source duration.
It is not a persistent or cross-command cache, and timestamp identity is not a content digest.
Projects without whole-set consumers do not access audio. Browser and Remotion previews share the
same implementation. Six focused tests cover reuse, isolation, source edits/replacement, bounded
source retention and recovery. The initial test expected an unresolved macOS temporary-directory
alias; correcting the fixture to its real path made the error-path assertion portable.

Whole-set reuse validation passes: 673 tests in 112 files, formatting/lint/types, isolation,
decoded smoke, and packed-browser CLI/all-theme still smoke. Direct and reused demo summaries
are deeply equal, including after a title edit. Candidate readiness integrations are committed
as bitmap 1db55ff and browser-first eb40319; both pass ready, both exporter acceptance suites,
frame-driver checks and installed browser smoke. Browser-first also passes the optional Remotion
compatibility installation. No throughput claim follows from these shared-load checks.

### Export-runtime reference inspection

The preview now captures one PNG through the existing export session and bounded queue. Requests
accept an explicit reference kind with equal first/last frames; the server still chooses every
output path and applies origin/token checks. Completed jobs retain Chromium version and bundle
digest. The view displays only captures matching its current revision and paused frame. Local
reference images remain in-browser; numeric differences compare the PNG and imported image after
8-bit sRGB canvas decoding, not the interactive DOM or encoded video quality. The actual-browser
workflow check passes direct-still decoded equality, zero differences for identical images, one
changed pixel for a controlled edit, and stale-frame hiding, alongside existing export recovery.
Visual inspection found that the interactive driver's preparation cover briefly obscured a ready
export image; the cover now applies only while displaying the interactive frame. Final validation
is pending. Corrected long corpus metrics continue independently and are not performance samples.

Reference inspection validation passes: ready (676 tests in 113 files, lint/types/formatting,
isolation and decoded smoke), interactive preview and reference/export workflow checks, both
exporter acceptance suites, and packed-browser smoke. Final desktop/narrow screenshots were
inspected. The full evidence is in `docs/research/preview-reference-2026-11-01`.

### Corrected long corpus completed

The full 63-second chunk-boundary comparison completed against committed upstream 6c373c0 with
the shared readiness correction. Every recorded quality comparison still passes at browser
JPEG 100 / CRF 16 versus Remotion CRF 18. A full decoded scan finds no black frames in either
output. `docs/research/corpus-quality-2026-11-01/chunk-corrected` retains provenance, metric
reports and sample hashes. The original faulty arm remains archived. All eleven frozen cases
now have valid numerical quality arms. Default quality and the 30% speed target remain unqualified;
these runs overlapped other validation and cannot establish throughput.

The corrected long comparison preserves the previous lossless reference RGB hash. Baseline
validation passes: 676 tests in 113 files, lint/types/formatting, isolation and decoded smoke.

### Native capture experiment closed

The new independent-driver probe uses native drawable HTML, `requestPaint` and `drawElementImage`
after the normal frame-readiness handshake. It imports no Remotion package. Chromium 156 requires
the explicit experimental flag; 192 theme/aspect/transition samples and 60 GPU/video/art samples
all exceed the existing source-precision allowance. Chromium 157 reproduces the Pirate results
over twelve further samples. Portrait credit crops show changed text rasterization. The findings,
complete reports and representative crops are retained in `docs/research/native-browser-capture-2026-11-01`.
No production flag, capture transport or theme workaround was introduced. This is a rejected
phase-2 experiment, not a speed improvement. Screenshot capture remains the compatible route;
new native binary distribution work remains an optional future optimization.

Native probe validation passes formatting, lint/types and the full ready suite (676 tests in
113 files, isolation and decoded smoke). The experiment changes no production rendering code.

### Quiet timing and full-master preparation

All own correctness jobs finished before new worker timing began. The isolated upstream runtime
runs three alternating one/automatic pairs per standard, tunnel and looping-video fixture with
the unchanged 15% pre-run CPU limit. Busy samples wait; no other project's processes are stopped.
Evidence goes to `examples/demo/out/scaling-quiet-*-2026-11-01` and matching `/tmp/setcast-scaling-quiet-*.log`.

The endurance harness inspection found two qualification gaps: it records only Node RSS, and it
does not forward the project's export settings. The pending correction uses public core/node
loading, forwards explicit output settings, records runtime decisions and adds sampled process-tree
RSS with its shared-page/external-service limitations. Its validation waits until timing is idle.

All three worker series completed their six arms with identical decoded video hashes within
each fixture. Median reductions versus one worker are 32.9% standard, 31.9% tunnel and 41.5%
looping video. Complete reports and load observations are in `docs/research/worker-scaling-2026-11-01`.
The qualified automatic-policy patch is now applied to main, with integration validation pending.
The separate current-Remotion timing series has started in the isolated upstream runtime at
browser JPEG 100 / CRF 16 versus Remotion CRF 18, both selecting workers automatically. No main
validation runs concurrently with that comparison.

Automatic scheduling integration passes ready (679 tests in 114 files), scheduling acceptance
with four selected workers and exact cached/resumed video and audio, both exporter acceptance
suites, preview reference workflows and packed-browser installation. The scheduler is now enabled
on main. No quality setting or renderer default changed.

Endurance measurement correction passes a ten-second real-master export with 300 frames, the
project's nondefault JPEG 90 / CRF 22 settings, decoded verification and audio checks. All six
process samples are available; final temporary directories are empty. Evidence is retained in
`docs/research/endurance-monitor-2026-11-01`. This validates instrumentation only; a corrected
full-master run remains required. Shared working-tree ready and exporter checks pass.

The quiet current-upstream comparison completed all three alternating pairs for standard, tunnel
and looping video. Browser wall time is higher in every fixture. Browser decoded hashes retain
the qualified one-worker output; automatic Remotion hashes differ from its earlier quality arm,
so this is not a newly qualified matched-quality comparison of every output. Reports and the
negative result are retained in `docs/research/current-upstream-2026-11-01`. The default remains
blocked. A direct CDP JPEG/fast-PNG experiment will isolate transport costs without changing the
production CSS contract or weakening the quality threshold.

Bitmap quiet timing passes three alternating pairs at one worker. All six outputs have identical
decoded video hashes and input identities. Median wall time falls from 34.248 to 26.325 seconds
(23.1%). This isolates video preparation at JPEG 95 / CRF 18, not current-Remotion performance.
Reports are in `docs/research/bitmap-video-timing-2026-11-01`; automatic-worker throughput and
full-master resources remain required before promotion.

The bitmap candidate integrates main through 53d7594, including automatic scheduling and corrected
endurance instrumentation. Ready passes 679 tests in 114 files plus lint/types/formatting,
isolation and decoded smoke. Browser exporter acceptance and packed-browser installation pass.
The first acceptance invocation used an unsupported `--renderer` harness flag and stopped before
rendering; the corrected `--adapter` invocation passes. The merged candidate is ready for the
full-master looping-video resource run, not yet for production promotion.
The integrated bitmap candidate is committed as 8c3cafc after ready, exporter acceptance and
packed-browser checks. It now includes main's automatic scheduler and corrected endurance
instrumentation. A separate full-master workload retains the existing real audio/timeline and
uses the portable looping-video fixture; it does not modify the original project or master.
Direct JPEG and fast PNG each pass 192 independent-page exact pixel samples and encoded
color-chart playback checks in the isolated direct-capture candidate. Further recovery, GPU/video
and complete-export timing qualification is pending; no production capture mode changed.

The browser-first integration is committed as fad4bb2. Ready and both fresh installation paths
pass with current main workflows, including preview, clips, bundled outputs and reuse. The
browser-only dependency tree physically excludes Remotion. Evidence is mirrored on main in
`docs/research/browser-first-merged-2026-11-01`; Linux/Windows and release speed criteria remain
unqualified. No package was published and production defaults remain unchanged.

### Persistent preparation implementation in progress

Repeated CLI exports still decoded whole-set overview/travel summaries before looking up encoded
chunks. The new opt-in preparation path uses the same `--cache` directory, lock, aggregate byte
budget, eviction and clear command. Index version 2 distinguishes video and analysis payloads;
version-1 entries migrate as video. The inspection report keeps its version and adds entry kind.
Older binaries reject the new index instead of treating analysis as video.

Preparation identity includes source content, requested summaries, core/producer code, decoder
versions and host/runtime identity. Source metadata and aliases are checked again after preparation.
Reads are capped at 64 MiB, checksummed and shape-validated; invalid summaries are recomputed.
Only summaries are persisted, not PCM. Appearance edits can reuse preparation when the requested
summary kinds stay the same. The implementation is not committed yet; tests, installed-package
checks and a preparation-cost measurement must pass before acceptance.

Direct-capture timing reached five successful standard-fixture arms. Direct JPEG was close to
the screenshot control; fast PNG was substantially slower. The sixth arm waited a full minute
above the unchanged 15% CPU limit and stopped before exporting. Preserve its busy report and
retry remaining comparisons in a new output directory when the host is quiet. No other own
correctness job ran during those timing arms.

Persistent preparation validation passes: 685 tests in 115 files, full ready, exact fresh/reused
summary and decoded video/audio comparison, existing cache recovery, both exporter suites and
packed-browser installation. Fresh installed CLI commands reuse one analysis payload and all six
video frames; inspection and clearing cover both kinds. The preparation timing attempt exported
nothing and measured no arms because all twelve CPU samples exceeded 15%. Evidence is retained
in `docs/research/preparation-cache-2026-11-01`. Functional reuse is complete; no timing advantage
is claimed. The full-master bitmap resource run is now active at committed candidate 8c3cafc,
with 1080p30 looping video, the existing 3,372-second real audio/timeline, sampled process memory,
disk reserve and decoded/audio verification. Concurrent external load makes it resource evidence only.

### Transparent output and editing intermediates in progress

The next implementation adds `output.codec: prores-4444` and `output.transparent: true`, with MOV,
lossless PNG frame capture and one continuous 48 kHz stereo PCM soundtrack. H.264 remains the
default. Transparent Stage omits project/per-play art and root backdrop decorations; foreground
panels, visualizers and branding keep their own CSS. Brightness fades the foreground's opacity.
Transparent stills require PNG. Configuration, capabilities, diagnostics and preview jobs now
carry the format explicitly; unsupported Remotion settings fail before preparation.

The first local qualification passes 63 moving chart frames with text, glow, masks and four alpha
levels. FFmpeg decode has maximum alpha error 1/255 and maximum black/white composite error
2.957/255, against limits fixed before the run (alpha 1, composite mean 1.5, maximum 12). Chunked
and continuous exports decode identically; repeat cache exports capture zero frames; interrupted
export reuses 30 frames and matches a fresh video/audio result. All sixteen landscape theme
stills contain transparent and partial-alpha pixels. Native AVFoundation reports `StraightAlpha`,
recognizes the sRGB/BT.709 metadata and decodes 63 frames at exact 30 fps timestamps. Its composite
maximum is 3.004/255 and mean 0.109/255. This checks the macOS receiving API, not a particular
editor's project color settings or OBS playback.

Raw development evidence is under `examples/demo/out/prores-alpha-2026-11-01-r2`. The initial
run used an explicit range ending at 3.1415 seconds but expected the existing acceptance harness's
clamped final-frame count. It correctly returned 62 frames. The corrected harness uses the
established `[1.05, 8]` range and expects 63; no range contract changed. The first test run also
failed localhost binding in the sandbox. An escalated ready run passed formatting/types but hit
the existing five-second cache/preview CLI test timeouts while native compilation and the
full-master export were running. Those failures remain logged; validation must pass before commit.

VP9 alpha remains a separate investigation. Remotion's current transparent-video documentation
describes possible alpha differences at independently encoded chunk boundaries, so it cannot
inherit the H.264 join qualification. ProRes 4444 supplies both a transparent compositing file and
an editing intermediate without that temporal alpha dependency. OBS's documented portable mode
does not support macOS; no user OBS profile was modified for this work.


The native receiver, source-slice PCM and brightness checks pass in the expanded third ProRes
run. Both exporter acceptance suites pass. The installed package exercise initially combined
`--bundle` with `--range`, which the CLI correctly rejects; the corrected tiny full-set fixture
then used a subminimum `clip --seconds` value. Both harness mistakes are retained in the research
folder. The final installed run uses an allowed ten-second clip request clamped to the 0.3-second
fixture and passes render, clip, PNG still, bundle, validation and alpha/ProRes diagnostics.

Ready passed all 688 tests after giving the four-process cache and six-process preview checks
local 30-second budgets. Cache subprocesses now have an explicit ten-second deadline too. That
independent test fix is committed as 64bb62d. A subsequent ready run overlapping package
validation hit five-second doctor/validation CLI test deadlines; no assertions failed and those
tests were not relaxed. Final validation is rerun without another own validation job. The
full-master resource export remains active; none of these elapsed times qualify performance.


ProRes integration is ready to commit. Final ready passes 688 tests in 115 files, formatting,
lint/types, dependency isolation and the decoded H.264 smoke render. Both adapter acceptance
suites and the corrected fresh installed-package checks pass. Evidence, including failed harness
attempts, is retained in `docs/research/prores-alpha-2026-11-01`. The production H.264 defaults
and quality settings are unchanged. The native receiving API is qualified locally; specific
editing applications, OBS and other platforms remain explicit limits.


### Native bitmap host and current distribution integration

ProRes 4444 is committed as e8061ce. The browser-first candidate now merges that milestone and
persistent preparation reuse. Its first baseline attempt overlapped another check process and
hit the existing five-second doctor/validate subprocess deadlines. The second baseline passes
all 688 tests and the decoded smoke render. Fresh browser-only and optional-adapter installation
checks must pass before the integration commit.

An isolated Electron 45.2.1 runtime is evaluating full browser paint through `capturePage()`
and `NativeImage.toBitmap()`. This is a CPU bitmap readback experiment, not the rejected
HTML-in-canvas path or a shared GPU texture implementation. Production dependencies are unchanged.
The initial four sterile-tech landscape/portrait samples match both same-host CDP PNG and the
pinned Playwright PNG byte for byte after RGB decoding. All-theme qualification is running;
no throughput claim follows from four samples.

The pilot retains three harness failures: npm installation had not fetched the runtime binary;
awaiting `app.whenReady()` at module evaluation prevented startup; and closing the first fixture
window exited the app before portrait capture. The corrected host starts its asynchronous run
without blocking module evaluation and owns shutdown explicitly across fixture windows. The
controller checks that the native report contains every requested frame. Electron's ESM startup
requirements are documented at https://www.electronjs.org/docs/latest/tutorial/esm.

The full-master bitmap resource export remains active, beyond 87,000 of 101,160 frames. Its
sampled summed process RSS remains around 4.5 GB at this point. This is provisional resource
evidence under concurrent correctness/external load, not a completed memory or speed claim.


Browser-first integration is committed as 9b4a82e. Both fresh installations pass, with browser-only
package inventory proving that Remotion is absent. Its evidence is mirrored on main under
`docs/research/browser-first-prores-2026-11-01`.

Electron `capturePage()` passes 191 of 192 all-theme/aspect/seek comparisons. Darkroom landscape
at absolute frame 3029 after a backward seek returns stale and partly missing content, including
the old elapsed timer. Its same-host CDP PNG and pinned Playwright PNG agree. The native maximum
channel difference is 244/255. This capture path is rejected for production; the original PNGs
and measurements are retained. A separate `invalidate()` / `paint` event experiment tests whether
explicit compositor repaint fixes the synchronization problem. It does not weaken pixel limits.

A bench-only chunk scheduling comparison is also checking four pages sharing each sequential
chunk against four independent page/encoder workers. Both arms use identical absolute ranges,
chunk boundaries, JPEG quality, encoding settings and a single continuous master soundtrack.
Only exact decoded video/audio equality can permit subsequent quiet timing. Production still
uses the qualified round-robin scheduler.


The explicit Electron repaint attempt also fails: 30/30 Darkroom reproducer samples and 191/192
all-theme samples differ from both PNG references. The original `capturePage()` failure is exactly
the preceding frame's decoded RGB, proving stale output. Both handshakes are rejected, with
reports and representative images in `docs/research/electron-bitmap-2026-11-01`. No native runtime
or fast path enters production. Research harnesses pass ready (688 tests), lint/types and smoke.
The chunk-worker pilot passes exact 360-frame video and audio equality; its loaded timings remain
unqualified. Its report is in `docs/research/chunk-scheduling-2026-11-01`.


The complete bitmap master run passes at 8c3cafc: 3,372 seconds, 101,160 decoded 1080p30 frames,
four workers, and six stereo alignment windows with zero measured lag. All 361 process samples
are available; peak summed RSS is 4.691 GB, with quarter-hour medians increasing from 4.127 to
4.458 GB. Peak run-directory bytes are 1.799 GB and final temporary directories are empty.
The run overlapped correctness/external work, so its time is not throughput evidence. Reports and
scope limits are retained in `docs/research/bitmap-endurance-2026-11-01`. The candidate now merges
main through 5d5349f; integration checks and quiet automatic-worker timing precede promotion.


The latest bitmap integration passes ready (688 tests in 115 files), both exporter acceptance
suites and fresh installed-package browser checks, including persistent preparation and ProRes.
The integration changes no H.264 quality defaults. Its logs are retained beside the full-master
report. Automatic-worker quiet timing is the final bitmap promotion requirement.


Automatic-worker bitmap timing completes three alternating pairs at clean baseline 5d5349f and
candidate e388178. Every input identity, decoded video hash and file size matches. Median wall
time is 20.373 seconds for PNG and 13.713 for bitmap (32.7% lower). A busy third-arm attempt
exports nothing and is retained beside its successful retry. All arms satisfy the unchanged
15% pre-run CPU limit without concurrent own validation. Evidence is in
`docs/research/bitmap-auto-timing-2026-11-01`. Bitmap's promotion requirements are now met; this
does not establish the separate current-Remotion speed target or change the default renderer.


Bitmap video preparation is promoted to main after the completed qualification. The production
change replaces video-frame PNG serialization with BMP V4 blob images and explicit decoder/URL
ownership. It preserves the image DOM, screenshot transport, H.264 defaults and renderer choice.
The main merge uses the same validated source tree as e388178, with subsequent evidence and
roadmap updates. The independent distribution candidate remains separate from this optimization.


Direct screenshot transport qualification is closed without production adoption. Three quiet
alternating pairs per mode on the standard fixture give control/direct-JPEG medians 6.892/7.117 s,
with exact decoded hashes, and control/fast-PNG medians 7.054/21.545 s. JPEG shows no measured
benefit and PNG regresses the complete export at these settings. GPU/video timing is not claimed.
Source/color/recovery checks, the original partial/busy series and complete timing reports are
retained in `docs/research/direct-capture-2026-11-01`. The experiment stays isolated at f5d06b5.


Preparation timing is complete at a00ece3: three alternating warm pairs on the real 3,372-second
master pass the 15% pre-run CPU limit and exact summary equality. Computed/cached medians are
2.622/0.859 s (67.3% lower). The measurement includes source/cache validation, not full
CLI/export startup. Evidence is appended under `docs/research/preparation-cache-2026-11-01`.

Chunk scheduling is closed without production adoption. Three quiet alternating pairs per
standard/Tunnel/video fixture preserve decoded video and audio exactly in all eighteen outputs.
Median reductions are 0.8%, 2.1% and 5.1%, with about 2 GB additional peak summed RSS in each case.
The first two timing ranges overlap. Production keeps round-robin capture; ordered checkpoint
publication and multiple encoders are not justified by this short four-chunk result. A long-master
study at the actual default chunk duration remains a future optimization, not a release blocker.
Reports and the decision are in `docs/research/chunk-scheduling-2026-11-01`.


The final browser-first integration is committed as e28d2bd, incorporating production through
a00ece3. Ready and both fresh tarball installation paths pass, including the bitmap optimization
and current ProRes/cache/preview workflows. Reports are mirrored under
`docs/research/browser-first-final-2026-11-01`. The candidate's migration/rollback guide is now
available on main as a plan, with explicit handling of transparent ProRes when selecting Remotion.

Local implementation and experiment decisions are recorded for every roadmap phase. Production
still retains the Remotion default and required adapter because the current-upstream first-export
objective and supported-platform evidence are unresolved. No Linux/Windows runtime is exposed in
this session, and the remote-environment tool is unavailable. The user has been asked whether
additional test machines are available; no external CI or publication was initiated. Optional
receiver/VP9/cross-machine-cache and long-chunk studies are separate from the core release work.


Final main validation passes formatting, lint/types, all 688 tests in 115 files, dependency
isolation and the decoded smoke render. The promoted bitmap implementation also retains both
exporter acceptance and installed-package passes. Final timing summaries and the browser-first
candidate's clean-install reports are committed with the reconciled roadmap. The standalone
results chart is `docs/research/renderer-replacement-results-2026-11-01.html`.

## Linux session handoff, 1 November 2026

The user confirmed Linux access and no easy access to Windows. Added
`docs/linux-renderer-qualification.md` with committed-ref transfer, Linux bootstrap and host
inventory, sequential production checks, candidate-only independent installation, optional NVENC,
full-master resources, current-upstream quality/performance and additional live checks. It defines
the reports to preserve and explicit completion limits. Windows qualification and the default
promotion criteria remain unchanged. No Linux execution or external publication occurred here.

Two source-transfer details matter: main's package smoke does not support the candidate's
`--report` or fresh independent installation, and the retained upstream comparison branch predates
the promoted bitmap implementation. The runbook requires testing the correct candidate and building
an isolated current-upstream comparison from the final qualified code. Ignored real masters need
separate transfer; a Git bundle carries committed branches and reports but not those assets.

Handoff validation on macOS passes `vp run ready`: formatting, lint/types, all 688 tests in 115
files, dependency isolation and decoded smoke. The first sandboxed attempt failed five localhost
tests with `listen EPERM`; rerunning with localhost access passed. Runbook relative links and
directly invoked TypeScript paths were checked. These results validate the documentation change
against the existing checkout; they are not Linux qualification evidence.

## Linux execution started, 1 November 2026

The supplied bundle verifies; production starts at 55a7b67 and both handoff branches
are restored locally without overwriting master. Fedora 44 x64 exposes a Ryzen
9 5950X, 64 GiB RAM and an RTX 3070 Ti PCI device, but nvidia-smi cannot communicate
with the driver. No hardware qualification is inferred. Initial ready fails on
an incomplete pre-existing dependency tree; frozen installation is being repaired
before source defects are assessed. Original failures and commands are retained in
[Linux evidence](research/linux-qualification-2026-11-01/README.md).

Frozen dependency installation restores the baseline: all 688 tests and decoded smoke
pass. Host device access also resolves the apparent NVIDIA failure; the sandbox had
hidden device nodes. The provisioned browser doctor identifies Chromium 156.0.8078.4
with NVIDIA ANGLE and passes all requested features, including a real NVENC probe.
Remotion's required swangle doctor passes using Chromium 149 and SwiftShader.
Neither probe alone qualifies full exports or hardware endurance. No real master
is present in the checkout.

The Linux worker matrix discovers source-precision failures on NVIDIA ANGLE:
Pirate landscape differs at up to 35 pixels by one level (budget 21), and
Afterhours landscape differs across repeated one-worker pages as well as worker
counts. The original PNGs and reports remain retained. These failures prevent
claiming complete production fidelity despite both short acceptance suites passing.
Investigation will distinguish graphics rasterization from frame/readiness behavior;
thresholds remain unchanged.

The isolated browser-first candidate fb00141 passes ready (688 tests), both exporter
acceptance suites and a fresh browser-only tarball installation. The installed
inventory contains no Remotion packages; default workflows, themes/video,
cache/resume, preview and ProRes pass. The optional-Remotion installation is still
running. This establishes the exercised Linux installation behavior, not full
backend fidelity or release readiness.

All 32 worker cases pass exact decoded equality with explicit default graphics,
observed as SwiftShader. Four repeated Masthead rounds also pass all eight
orientation cases without screenshot timeout. The NVIDIA raster-disable experiment
did not fix Pirate or Masthead and remains rejected. Based on this backend
isolation, browser Linux auto now follows Chromium's default graphics selection;
explicit angle remains opt-in and unqualified on the tested driver. Remotion's
graphics policy, the default renderer, and NVENC selection are unchanged.
Baseline and both acceptance suites are being repeated before committing this fix.

Committed fix 29e7dbc passes the full automatic-backend worker matrix: all 32
theme/orientation cases have exact decoded equality across 1/2/4 workers, including
Pirate, Afterhours and Masthead. Same-page frame checks and bitmap roundtrip also
pass on the committed fix. Remaining affected checks, final candidate installation
and resource requalification continue. Explicit NVIDIA angle failures remain retained.

The complete affected production suite passes on 29e7dbc: frame order, all 32 exact
worker cases, bitmap/video frames, color, WebP, both GPU recovery harnesses, resume,
chunk/incremental/preparation caches, preview/queue, ProRes and decoded verifier.
The automatic backend is observed SwiftShader. Final browser-first installation
and resource checks are now being repeated with this committed implementation.

Linux final candidate `a61a0b1` passed ready, both acceptance suites and both independent fresh tarball installations after the graphics fix. Browser-only inventory remains Remotion-free; explicit optional compatibility renders six decoded frames. See the Linux evidence `final-installed-*` reports. Production and candidate defaults remain scoped to their existing branches.

Final Linux NVENC checks pass after the graphics fix: required encoder, 19 acceptance chunks, color, resume identity, and a 120-second/3,600-frame decoded synthetic export with four zero-lag stereo windows and cleanup. Reports retain separate SwiftShader graphics and NVENC encoder identities. Full-master assets remain absent.

Linux current Remotion 4.0.539 leaks an 8,294,464-byte named POSIX pool after injected encoder failure, reproduced twice. The existing encoder-failure harness passes destination/temp-directory checks; an independent `/dev/shm/rmshm-*` observer fails. Normal/cancellation acceptance creates and removes its new pools. A library teardown race is under investigation; successful-export comparisons do not erase this cleanup failure. Evidence: Linux `shm-observed-failure.json`.

Final Linux software resource repeat passes the 120-second preset with 84 samples, peak summed RSS 3.09 GB and temporary-directory cleanup. Additional verification decodes all 3,600 frames of that same file and passes four stereo alignment windows. Final bitmap memory passes 3,000 captures with all URLs revoked and no monotonic interval RSS growth. Full real-master Linux qualification remains blocked by missing assets.

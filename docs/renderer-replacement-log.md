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

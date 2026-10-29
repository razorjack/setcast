# Experimental browser exporter

Remotion remains Setcast's default renderer. The opt-in `browser` exporter uses Playwright,
its pinned Chromium runtime, and a system FFmpeg subprocess. Themes, visualizers, timeline
queries, audio analysis and frame assembly use the same Setcast contracts in both exporters.
The browser package has no Remotion dependency.

The [independent renderer replacement plan](renderer-replacement-plan.md) records the current
capability comparison, performance evidence, remaining experiments and release criteria. Its
proposed faster capture, scheduling, persistent cache and preview/export workflow are
not implemented by this guide. Remotion remains the default, and the CLI still depends on its
adapter during migration.

## Run it

Install FFmpeg on PATH, then install the pinned browser once:

```sh
setcast browser-install
setcast still path/to/project --renderer browser --at 1:30 --out frame.png
setcast render path/to/project --renderer browser --range 1:00-1:10 --out clip.mp4
setcast clip path/to/project --renderer browser --at 1:30
```

In a checkout, prefix these commands with `node packages/cli/bin/setcast.js` in place of
`setcast`. Linux also needs Chromium's system libraries. Browser installation is explicit;
ordinary Remotion rendering retains its existing provisioning.

To select the exporter for a project:

```yaml
renderer: browser
```

Omitting `renderer` selects `remotion`. `--renderer` overrides the YAML for `render`, `still`,
`clip` and `preview`, including bundled thumbnails and batches. Failure is reported without switching
exporters. `preview --renderer browser` opens the [independent frame inspector](independent-preview.md);
Remotion Studio remains the default preview. `play` and `live` use browser playback independently
of this setting.

## Supported settings and limits

The prototype writes PNG, JPEG and WebP stills, and H.264 video with AAC audio in MP4, MOV or
MKV. Video requires FFmpeg with AAC and the selected H.264 encoder; software encoding uses
`libx264`. PNG, JPEG and lossless WebP need no system
FFmpeg. Audio analysis accepts mono or stereo recordings supported by the pinned Chromium
and Mediabunny decoder. Re-export an unsupported input as PCM WAV.

`output.gl` currently accepts `auto`, `default` and `angle`. Other graphics backends fail
with an explicit alternative before capture.

Software encoding supports `crf`, `videoBitrate`, `x264Preset`, `jpegQuality`, profiles and
`chunkSeconds`. `parallelEncoding` must be true. Hardware H.264 uses VideoToolbox on macOS and
NVENC on Linux/Windows with a compatible NVIDIA device and driver. Set `hardwareAcceleration:
if-possible` or `required` and an explicit `videoBitrate` such as `12M`; omit `crf` and `x264Preset`.
Software encoding remains the default. A bounded one-frame encode checks the requested dimensions,
FPS and bitrate before capture. VideoToolbox cannot silently use its software implementation.

`required` fails if the probe cannot encode. `if-possible` falls back to libx264 at the requested
bitrate; the CLI prints the reason. Library callers can inspect `onRuntime` encoding-selection
events. A failure after capture begins fails the job atomically; it does not mix hardware and
software chunks. Resume identity uses the resolved hardware setting. Run `setcast doctor
--renderer browser --require hardwareEncoding` to check the current machine.

VideoToolbox has passed the export acceptance suite on Apple M1 Pro. NVENC selection and failure
behavior have unit coverage; Linux/Windows device qualification and matched-quality performance
comparisons remain outstanding. Hardware bitrate equality does not establish equal visual quality.

`--concurrency` accepts 1 through 8 and defaults to 1. Each worker retains its own bounded
PCM windows and decoder cache, so more workers use more memory. Capture overlaps encoder writes
through a bounded queue: at most one pending capture per worker plus the image being written.
Each worker prepares its next assigned frame after its previous capture is consumed; it does
not wait for the other workers to finish a batch. Frames still reach FFmpeg in exact order with
backpressure. Start at 1 or 2 and measure your project. Independence is not a speed guarantee.

Ctrl+C or SIGTERM cancels a CLI export. Programmatic `render` and `still` accept an
`AbortSignal`. Preparation may need to finish before cancellation is observed. Video output
is assembled in a temporary directory beside the destination and renamed only after success.
Failure and cancellation preserve an existing output file and remove temporary files.
With `--resume`, completed checkpoints are retained separately as described below.

## Resume an interrupted export

Install both `ffmpeg` and `ffprobe` on PATH, then add `--resume` from the first attempt:

```sh
setcast render path/to/project --renderer browser --resume --out set.mp4
```

After Ctrl+C, SIGTERM or a render failure, rerun the same command. Setcast stores completed
silent-video chunks in `set.mp4.setcast-resume` beside the output. The progress line reports
reused frames. It captures only missing or invalid chunks, then encodes the continuous master
audio and assembles the final output again. A failure during final assembly can therefore
resume without capturing any frames. The existing output survives until successful replacement.
Checkpoints are removed after the final video is published.

Checkpoint frequency follows `output.chunkSeconds` in setcast.yaml, which defaults to 60.
For less work lost between checkpoints, choose a shorter chunk:

```yaml
output:
  chunkSeconds: 20
```

Only completed chunks are reusable. `chunkSeconds: 0` makes the entire range one chunk, so an
interruption during frame capture cannot reuse partial work. Resume is available on `render`,
including `--range` and `--bundle`; it is not a `clip` or `still` flag. Remotion explicitly
rejects the resume option. Programmatic browser `render()` accepts `resume: true`.

Reuse requires an identical resolved project, frame ranges, encoding settings, concurrency and
graphics backend. Setcast hashes audio, global/per-play/replay backgrounds, the capture bundle
and adapter code, and records runtime identity including Chromium, Playwright, FFmpeg, Node,
OS and host. Embedded fonts and artwork are covered by the resolved CSS. Changed identity
starts a fresh set of checkpoints; it never mixes chunks from two configurations. Missing or
checksum-mismatched chunks are rendered again. Each newly encoded chunk is checked for codec,
dimensions, frame rate and frame count before being flushed and atomically added to the manifest.

Keep source files unchanged during a job. Changes detected during capture or assembly stop the
export. Resumable jobs require self-contained CSS: use relative local `url()` references so
Setcast embeds them, and remove `@import`. Network requests and untracked resources are rejected.
Render without `--resume` if the scene needs them. Checkpoints are local recovery files, not
portable render artifacts; keep the machine's fonts and graphics environment unchanged.

Allow disk space for the checkpoints, working chunk copies and final output. Hashing large
source files and validating checkpoints adds startup work. Without `--resume`, the existing
temporary-file workflow is unchanged.

Concurrent resumable jobs cannot share one checkpoint directory. `lock.json` contains the
writer's PID, host and start time. Graceful cancellation removes the lock. A process crash or
forced kill can leave it behind: confirm that the recorded process is no longer running before
removing only `lock.json` and retrying. Setcast never steals a lock based on its age. A missing
or malformed manifest produces an error; remove that checkpoint directory to start fresh.
Temporary files left by a forced kill can be removed after the process has stopped. Do not
edit a checkpoint directory while a render is running.

The recovery regression is:

```sh
node packages/renderer-browser/bench/resume.ts
```

It verifies frame-identical resumed output, interruption before and during assembly, missing and
corrupt chunks, changed audio/artwork/configuration/encoding, source edits during a job and
untracked resource rejection. CI runs this check and both exporter acceptance suites.

## Frame delivery

The Node driver requests an absolute integer frame. The browser prepares the corresponding
PCM window, calls core's `resolveFrame`, commits React, and waits for labeled asset holds,
layout effects, canvas work, fonts, decoded images and stable animation-frame callbacks.
The driver checks the acknowledged frame number before capturing. Readiness errors name the
pending asset; a separate watchdog bounds requests that stall during audio decoding.

Background video uses Mediabunny to decode the requested frame into an image. It does not
use the approximate native-video synchronization used by real-time playback. Chunk boundaries
use core's shared range math. FFmpeg encodes one continuous master soundtrack alongside video
capture, then muxes it with the silent video chunks after both finish. A failure cancels both
tasks and waits for their cleanup before removing temporary files. No full-set AudioFeatures sidecar is required.

## Verification and comparison

Run both exporters against generated fixtures:

```sh
vp run export-acceptance --out examples/demo/out/remotion-reference
vp run export-acceptance --adapter ./packages/renderer-browser/src/export/index.ts --out examples/demo/out/browser-acceptance
vp run package-smoke --browser
node packages/renderer-browser/bench/frames.ts
```

The suite checks fractional ranges, the partial final frame, chunking, audio/video pulses,
delayed fonts, images, video seeking and looping, repeatable theme captures, failure recovery,
performance dimming/blackout, and cancellation. Both exporters passed on 2026-10-22. A direct driver check also verifies backward seeks,
video decoder reuse and delayed scene fonts within one page. Fixture audio pulses were within 5 ms
of the visual pulse. Packed CLI checks cover browser PNG and H.264/AAC output as well as the
default renderer and all built-in themes. JPEG, MOV and MKV are also verified. Native lossless
WebP capture replaces the former FFmpeg conversion. `node packages/renderer-browser/bench/webp.ts`
compares decoded WebP pixels with PNG across every theme and GPU visualizer, including portrait,
and verifies still export and setup diagnostics with FFmpeg absent from PATH. Capture uses the
pinned Chromium at quality 100 and rejects an unexpected lossy encoding. Readiness, cancellation
and atomic output replacement apply to WebP as they do to PNG.

Do not assume identical pixels across Chromium versions or graphics backends. On this machine,
Playwright 1.64.1 / Chromium 156.0.8078.4 matched the `relief` portrait reference exactly.
`sterile-tech` differed by at most 2/255 per color channel and `darkroom` by at most 1/255.
Mean absolute channel differences were 0.01035 and 0.00000434 respectively. Each exporter was
internally repeatable. The acceptance runner's `--reference` option deliberately still requires
exact pixels; those two cross-exporter fixtures do not satisfy that stricter condition.

A two-minute 1920×1080/30 fps demo export completed 3600 frames in about 169 seconds
with two workers and 20-second chunks on the development machine. Remotion took about
144 seconds with the same project and settings, so this prototype was about 18% slower.
Other local checks were running during parts of the measurements. Remotion imports were
explicitly forbidden during that run. This is one project measurement, not a general benchmark.

Keep both adapters while checking real projects, codecs, fonts, graphics backends, long exports
and installed distributions. Remove Remotion only after the alternative meets the supported
workloads and performance expectations. The next useful work is profiling capture/encoding,
qualifying Linux and Windows, and expanding fixture coverage. A sidecar or another capture API
should follow measurements, not precede a working exporter.

## Profiling and readiness optimization

```sh
node packages/renderer-browser/bench/export.ts examples/demo --seconds 10 --at 30 --concurrency 2 --out examples/demo/out/browser-profile
```

This writes profile.mp4 and report.json. The browser adapter's optional `onMetrics` callback
reports audio preparation, frame resolution, React commit, readiness, screenshot capture and
captured bytes per frame. Separate measurements cover encoder write backpressure, final flush
master-audio encoding (`audio-encode`) and muxing. Mux timing now excludes audio encoding; older
reports included it. Summed worker and audio durations overlap and are not wall time. Encoder writes measure waiting
on the pipe, not encoder CPU. Audio timings exclude initial decoder setup. Peak Node RSS excludes
Chromium and FFmpeg; use process-level tools for total memory.

The first measured optimization reduced readiness from three stable animation-frame callbacks
to two. Font and image decoding are awaited inside the stability loop; holds and revision changes
reset it. A ten-second 1080p/30 fps demo slice with two workers fell from 16.86 to 13.40 seconds
on this machine, a 20.5% elapsed-time reduction. Mean readiness fell from 43.30 to 23.87 ms per
frame. All 300 decoded output frames matched exactly. Both acceptance suites and the direct
same-page frame check validate the readiness contract. This is one local comparison, not a
general speed guarantee or a replacement for the earlier two-minute benchmark.

Direct CDP screenshot capture did not improve the initial comparison and was not retained.
Resumable verified chunks and bounded capture/encoding overlap are implemented. Keep metrics
enabled while choosing further optimizations.

Shared audio analysis also uses an [exact-output spectrum optimization](spectrum-optimization.md).
Its kernel benchmark is independent of screenshot/encoding throughput; use whole-export metrics
before attributing a render-speed change to audio analysis.

### Capture and encoding overlap

The second optimization removes the batch barrier between capture workers. A consumed capture
starts that worker's next assigned frame before writing the current image to FFmpeg. The queue
holds at most `concurrency + 1` images, including the write in progress. Worker assignments,
absolute frame times, readiness checks, JPEG quality and encoding settings are unchanged.
A failed capture interrupts another worker or encoder wait, closes capture pages, cancels
FFmpeg, and settles outstanding work before cleanup. Failure/cancellation still preserves the
destination and completed resume chunks.

The batched baseline is revision `d35ddcf`. Two sequential comparisons used the same 300-frame,
1920×1080/30 fps demo slice at 30–40 seconds:

| Run | Batched capture | Overlapped capture | Elapsed-time reduction |
| --- | ---: | ---: | ---: |
| First | 13.55 s | 10.56 s | 22.1% |
| Repeat | 14.19 s | 10.48 s | 26.1% |

The command above used two workers, JPEG quality 95, CRF 18 and the medium x264 preset on
Apple M1 Pro, Node 26.7.0 and pinned Playwright Chromium. All four exports had identical decoded
frames and identical captured JPEG byte totals (89,390,145 bytes). This is a short local
comparison, not a general throughput guarantee. [Raw measurements](benchmarks/browser-pipeline-2026-10-22.csv)
include summed worker timings and Node RSS; other processes are excluded from that memory metric.

The baseline spent 11.74–13.27 summed worker seconds in screenshot capture and 5.92–8.35 in
readiness. Audio-window preparation used only 47–82 ms; encoder writes waited 152–161 ms.
Those measurements support improving capture scheduling before introducing shared analysis
caches. JPEG quality was preserved because lower compression quality changes pixels; any future
compression change needs an explicit quality comparison. The earlier CDP experiment remains
unretained. Hardware encoding and shared analysis caching remain candidates for workloads whose
profiles justify them.

The pipeline unit tests cover bounded buffering, ordered writes, uneven worker completion,
encoder backpressure, partial ranges and failure cancellation. Browser acceptance and resume
recovery passed with the overlapped path, including GPU field equality across workers/chunks.
`vp run ready` passed all 450 tests and baseline checks; Remotion acceptance and installed-package
smoke with browser export also passed.

### Offline display scheduling

The export-only Chromium process now uses `--disable-frame-rate-limit`. Asset/React readiness
still waits for two stable animation-frame callbacks; the browser no longer applies display
refresh pacing to offline capture. Playback and independent preview retain their normal browser
scheduling. JPEG quality, output FPS, frame order and the bounded capture pipeline are unchanged.

On the post-branding baseline (5b24d4c), one-worker 1080p exports improved by 22–33% across branded
CSS, field/constellation GPU visuals and looping video. A one-minute branded export fell from
94.53 to 63.45 seconds. All 3,600 compared decoded frames were identical. A two-worker pair
improved only 4.2%, which needs more repetitions before treating it as a reliable gain.
See [renderer-scheduling.md](renderer-scheduling.md) for the complete matrix, reproduction,
raw measurements and platform limitations.

## Persistent reuse after successful exports

`render --cache <directory>` retains validated video chunks after success and interruption. An
identical export can reuse those chunks without capturing frames. Cache use is opt-in, supports
only the browser renderer, and is separate from output-specific `--resume` checkpoints. The two
options cannot be combined.

```sh
setcast render examples/demo --renderer browser --cache examples/demo/out/render-cache
setcast render examples/demo --renderer browser --cache examples/demo/out/render-cache
setcast cache inspect examples/demo/out/render-cache --json
setcast cache clear examples/demo/out/render-cache
```

Use a new dedicated directory or an existing recognized Setcast render cache. Exported files must
be outside it. Existing unmarked directories and symbolic directory links are rejected. The CLI
resolves `--cache` relative to its working directory. `--cache-size 2048` sets the video-byte limit
in MiB; 2048 MiB is the default. Lowering the limit evicts old entries when the next export opens
the cache. Chunks larger than the entire limit are rendered but not retained. The index also has
a 4096-entry limit. Eviction uses last-use timestamps; equal timestamps use a deterministic key order.
A cache smaller than a job may therefore retain only some of its chunks.

The limit covers managed video chunks, including a pending chunk copy after space is reserved.
It excludes index/lock metadata, unrelated files, the export's working copies and final output.
`inspect` reports indexed bytes and keys, not a recursive disk-usage or integrity audit. `clear`
resets the index and removes managed chunk/temporary files while preserving unrelated files and
unexpected directories. It also recovers a corrupt index. Only one export or management operation
can hold the cache lock at a time. A killed process can leave `lock.json`; inspect its process/host
before removing that file. Do not clear another active export's cache.

Identity includes the complete resolved project, source-file contents, ranges, encoding, worker
count, graphics choice, browser/bundle/adapter/FFmpeg versions, Node, OS and host. Changing these
invalidates reuse conservatively. Changing only the destination path can reuse chunks. Cached
exports require the same self-contained local inputs and resource restrictions as resumable
exports. These are local caches; cross-host sharing and selective reuse after project edits are
not qualified.

Each stored chunk passes stream/frame-count validation before publication. Reuse copies the
chunk into the export's temporary directory and checks its byte count and SHA-256. Missing or
corrupt chunks are rendered again. Input changes during export still prevent publication, and
cancellation preserves the previous destination. Cache write failures fail the export rather than
silently claiming that work was retained; rerun without `--cache` or choose another directory.

Cache hits still compute input/runtime identity and encode one continuous master soundtrack.
They do not skip browser startup or reuse audio. A fully cached job opens zero capture pages;
progress reports reused frames. Successful repeat reuse and decoded equivalence are checked by
`node packages/renderer-browser/bench/cache.ts --out NEW_DIRECTORY`.

H.264 exports declare the [sRGB screenshot color contract](renderer-color.md), including separate
YCbCr matrix, range, RGB primaries and transfer properties. Qualification and receiving-app limits
are recorded with the retained color probe.

# Rendering performance

Measured on 12 October 2026 against Setcast revision `12fe260`. Frame capture is the main
bottleneck on this machine. The most useful near-term changes are an optional faster encoding
profile and bounded chunks for long renders. Replacing the renderer with another Chromium
screenshot loop would retain much of the current cost.

The original evaluation added reproducible benchmarks without changing production rendering.
The fast profile and chunk pipeline are now implemented; see the implementation notes below.
Experimental output stays in the gitignored `demos/render-performance/`. The
[62 timing records](benchmarks/render-performance-2026-10-12.csv) are retained with this report.

## Scope and method

Hardware: Apple M1 Pro, 10 CPU cores, 32 GiB RAM, Darwin 27.0.0. Software: Node 26.7.0,
Remotion 4.0.513, Chrome Headless Shell 149.0.7790.0. The production macOS default uses ANGLE.
The tests ran sequentially on the existing workstation; other applications were not closed.
These are local measurements, not cross-platform guarantees.

The first sweep renders the demo at 1080p30, from 108 to 114 seconds. This crosses a rewind,
an audio window boundary and a shared drop, with overlapping credits. Each configuration runs
twice, with browser and bundle reuse. A second sweep uses 30-second clips. Preparation is timed
separately: the first bundle/browser/metadata preparation takes about 1.7 seconds and subsequent
metadata selection about 0.24 seconds. Each render still initializes its own pages and assets.

All timing comparisons include frame capture, encoding and muxing, but exclude preparation.
The 20%-80% frame interval estimates steady throughput. Later sweeps reverse configuration order
on the second repetition. Clips and raw records are retained locally for inspection.

A full one-hour render was not performed. Short-clip throughput and tests of one-hour frame
counts answer different questions; extrapolations below are explicitly estimates.

## Measurements

Thirty-second demo, 1080p30, mean of two runs:

| Settings | Time | Time saved | Output size |
| --- | ---: | ---: | ---: |
| Current defaults | 26.93 s | 0% | 12.42 MB |
| JPEG 92 | 23.51 s | 13% | 13.16 MB |
| Software `veryfast` | 24.25 s | 10% | 10.15 MB |
| JPEG 92 + `veryfast` | 20.22 s | 25% | 12.14 MB |
| Hardware, 12 Mbit/s | 24.35 s | 10% | 46.19 MB |

Twelve-second Stakka & Skynet clip, anamorphic at 1080p60, mean of two runs:

| Settings | Time | Time saved | Output size |
| --- | ---: | ---: | ---: |
| Current defaults | 18.55 s | 0% | 6.31 MB |
| 30 fps (changes motion) | 10.35 s | 44% | 5.31 MB |
| JPEG 92 | 17.65 s | 5% | 6.92 MB |
| JPEG 92 + `veryfast` | 15.92 s | 14% | 4.87 MB |
| Hardware, 12 Mbit/s | 17.40 s | 6% | 18.86 MB |

The combined JPEG/preset change saved 25% on the demo and 14% on the real project.
For the demo, a naive one-hour extrapolation is 54 minutes at default settings versus 40 minutes
with the combined change, before long-duration overhead. For the real 60 fps project it is
93 versus 80 minutes. These are short-sample estimates, not measured one-hour completion times.

Six-second demo sweep, mean of two runs:

| Change | Render time | Change from default | Notes |
| --- | ---: | ---: | --- |
| Default, five tabs | 6.72 s | reference | JPEG 95, software H.264 CRF 18 |
| One tab | 10.28 s | 53% slower | Less parallel frame preparation |
| Two tabs | 7.56 s | 13% slower | Lower memory use, lower throughput |
| Eight tabs | 6.97 s | 4% slower | More tabs do not imply more throughput |
| Software `veryfast` preset | 5.67 s | 16% faster | Compression and size change |
| Hardware H.264, 12 Mbit/s | 5.69 s | 15% faster | 9.37 MB versus 3.46 MB for default |
| JPEG 92 | 6.17 s | 8% faster | Possible gradient and texture changes |
| JPEG 90 | 5.83 s | 13% faster | More aggressive intermediate compression |
| JPEG 80 | 5.22 s | 22% faster | Poor default for dark gradients |
| Capture at 75% scale | 5.08 s | 24% faster | Output is 1440×810; full-resolution type is lost |
| 24 fps | 5.73 s | 15% faster | Motion cadence changes |

JPEG 92, JPEG 80, scale and FPS were measured in the second sweep, whose default was 6.82 s.
The percentages above use the common 6.72 s reference for easy comparison; small differences
should not be treated as precise improvements.

At default settings, long-exposure took 5.57 s, pirate 7.71 s and masthead 5.99 s for the same
six-second timeline. These are different scenes, not interchangeable performance presets.

## Where the time goes

A separate instrumented run at concurrency 1 measured 170 frames after dropping the first ten:

| Operation | Mean per frame | 95th percentile |
| --- | ---: | ---: |
| Frame seek and readiness | 9.48 ms | 10.75 ms |
| Screenshot capture and file write | 31.73 ms | 33.52 ms |
| Entire frame operation | 41.70 ms | 42.37 ms |

Asset collection averaged 0.87 ms and overlaps screenshot capture. The seek measurement includes
React, audio analysis, layout effects, readiness waits and browser protocol calls. It is not a
measurement of JavaScript computation alone. Screenshot capture includes browser painting,
readback, JPEG compression, protocol transfer and writing the image.

About 76% of this single-tab frame time is in capture. Even eliminating all frame preparation
would improve this serial frame path by only about 1.31×. This is an upper bound for this run,
not a prediction for five tabs, whose work overlaps and shares the GPU.

The engine already avoids several common costs: rasterized procedural textures, cached art
and bloom preparation, lazy audio features, fixed audio history grids, GPU rendering on macOS,
shared browser/bundle sessions and symlinked project assets. The audio and rendering contracts
also permit a different renderer without changing themes or plugins.

### Encoding did not overlap capture

Every timed render reported `parallelEncoding: false`. The installed Remotion version estimates
2.074 GB for a 1920×1080 encoding pipeline and requires more than twice that amount of free RAM,
plus a separate 2 GB reserve check. Node reported less free RAM than required, despite 32 GiB
being installed. Remotion therefore wrote the JPEG sequence and encoded afterward.

This matters for both speed and disk usage. The number of intermediate frames is 108,000 per
hour at 30 fps and 216,000 at 60 fps. At an illustrative 200 KB per JPEG, that is 21.6 GB or
43.2 GB before the final MP4. Actual JPEG size depends heavily on the artwork and theme.

Expose the resolved concurrency and parallel-encoding decision in diagnostics before adding
more tuning knobs. Benchmark on a machine with enough available memory to exercise the other
path. Do not force overlap by falsifying free-memory reporting; the memory check protects the
render from allocation failures. A bounded, backpressured pipeline would be a better long-term
solution than holding an unbounded queue of frames.

## Long renders have additional scaling costs

The pinned Remotion scheduler searches from the start of its frame array on every assignment:
`allFramesAndExtraFrames.find(frame => !rendered.has(frame))`. A microbenchmark calling the
installed scheduler, without a browser or encoder, measured:

| Frames assigned | Equivalent duration at 30 fps | Scheduling time |
| ---: | ---: | ---: |
| 1,800 | 1 minute | 0.022 s |
| 18,000 | 10 minutes | 3.11 s |
| 54,000 | 30 minutes | 23.51 s |
| 108,000 | 60 minutes | 89.33 s |

There is another growing cost in `render-frame-with-option-to-reject.js`. Each frame filters
all earlier asset records, maps and flattens their audio/video and artifact lists, and searches
frame arrays with `indexOf`. The asset scans happen even when the lists being scanned are empty.
The normal master soundtrack uses `inline-audio`, while video and legacy audio use the other
asset list.

An isolated reproduction of the two asset scans, with one audio entry per earlier frame,
measured 0.082 ms at 1,800 records, 0.801 ms at 18,000, 2.542 ms at 54,000, 5.627 ms at 108,000,
and 13.960 ms at 216,000. Setcast normally uses inline PCM audio, leaving those two asset lists
empty; the scans still took 0.063, 0.570, 1.713, 3.357 and 6.789 ms at the same history sizes.
These are costs of one scan at each history size, not total render times. They exclude browser work and do not establish a measured one-hour speedup.

This is a reason to avoid extrapolating six-second renders linearly. It also identifies work
that can be removed without changing any pixels.

### Master audio also accumulates per-frame PCM

Instrumentation confirmed that `@remotion/media` registers the master audio as `inline-audio`.
Its browser code converts interleaved stereo PCM to a JavaScript number array for transfer.
The renderer adds each inline-audio asset to the mixing pipeline and also retains it in the
per-frame `assets` list returned after rendering. The default target is 48 kHz stereo.
At eight bytes per number, an hour represents about 2.76 GB of sample values alone, before
array/object overhead and other copies. This is a source-level storage estimate, not a measured
peak RSS or a claim that this is the only memory cost.

A temporary prototype omitted only the master `<Audio>` component while keeping visual audio
analysis. Across two 30-second runs, its mean was 26.88 s versus 27.11 s for the matching control,
before external audio muxing. That difference is too small to claim a useful short-render
speedup. Removing PCM transfer and retention remains useful when designing bounded chunks or
an independent renderer. The prototype change was removed from production source.

### Recommended chunk design

Render bounded ranges, initially 30-60 seconds each, through one shared session. Keep frame
numbers absolute so timeline queries, modulation, drift, audio lookback and video loops retain
their original timing. Encode video-only chunks with identical settings, concatenate by stream
copy, then encode/mux the continuous source audio once. Independently encoding AAC in each chunk
can introduce priming and padding at joins.

Chunks bound intermediate disk use and per-render metadata history, permit restart from a
completed chunk, and allow periodic browser recycling for very long jobs. They add page startup
and encoder keyframes, so tiny chunks are inefficient and encoded pixels can differ near joins.
Before shipping, verify frame counts, audio sample alignment, repeated backgrounds, video loops,
and visual continuity around joins. Custom plugin audio and artifacts need an explicit policy;
external source-audio muxing is only equivalent to the current master-audio scene.

An alternative is to fix the scheduler and asset aggregation in the pinned renderer or verify
an upstream release that fixes them. A scheduler can keep a forward cursor and a small retry
queue; audio source lookup can use a map. Do not install a runtime monkey patch in Setcast.

A local proof of concept rendered the same 30-second demo range as two 15-second video-only
chunks, then muxed one continuous AAC soundtrack. It took 29.95 s, versus the 26.93 s unchunked
mean. This short test measures the startup penalty; it does not measure the expected savings
from bounding one-hour bookkeeping.

The result has exactly 900 video frames, 30.000 s video and audio duration, and 1,323,000 decoded
mono samples at 44.1 kHz. Cross-correlation against the source at the beginning, across the
15-second join and near the end found zero sample offset. The correlations were 0.99996,
0.98664 and 0.99998; AAC changes samples, so this checks alignment, not losslessness.
Video SSIM against the unchunked output was 0.99203. The inspected join frame retained the
absolute timeline position and layout. These checks support the design; they are not exhaustive
acceptance tests for arbitrary themes, plugins or video backgrounds.

## Quality and settings

Decoded-video SSIM against the default render was 0.98856 for JPEG 92 in the six-second demo,
0.98894 for JPEG 92 plus `veryfast` in the 30-second demo, 0.99215 for JPEG 92 in the real
project, and 0.99025 for its combined setting. Repeated baseline videos scored 1.00000 in
both short comparisons. These compare two compressed outputs, not either output against a
lossless reference.

Full-frame inspection at 1080p found matching layout and legible text, with small differences
in grain, gradients and fine photographic detail. The combined profile is a reasonable opt-in
candidate for the requested tolerance. This is not a blind viewing study, and SSIM can hide
local artifacts in small text or dark regions. No default quality reduction is justified from
two projects alone.

The useful low-impact controls are already partly available:

```yaml
output:
  width: 1920
  height: 1080
  fps: 30
  jpegQuality: 92
  hardwareAcceleration: if-possible
  videoBitrate: 12M
```

This is a candidate to compare with the existing output, not a universal quality-equivalent
preset. Remove `crf` when using bitrate or hardware encoding. Hardware acceleration is platform
and encoder dependent, and the tested 12 Mbit/s is not a quality guarantee for other scenes.
Keep JPEG 95 for gradient-sensitive work. Keep 60 fps if its motion is part of the desired look.

The software `veryfast` setting is now available through `output.x264Preset`, or as the default
for `output.profile: fast`. Both have schema validation and forwarding through renders, clips
and Studio. CRF 18 with a different preset is not a promise of identical quality or file size.
The [Remotion API](https://www.remotion.dev/docs/renderer/render-media) documents these encoder
controls; the measurements here use the installed 4.0.513 implementation.

## Changes that did not justify altering the scene

In the second six-second sweep, stripping every CSS filter and backdrop filter reduced 6.82 s
to 6.33 s, about 7%, while changing the art treatment. Adding `will-change` hints to backgrounds,
bloom and spectrum increased the time to 7.09 s. Neither is a suitable blanket optimization.

Removing both audio-reactive visualizers and audio modulation reduced it to 5.65 s. This is a
diagnostic upper bound that removes drawing as well as analysis; it does not predict an audio
sidecar's benefit. It would remove a central part of Setcast's output.

Lowering the entire render resolution helps, but upscaling cannot restore fine type, spectrum
edges or small rules. Duplicating frames to produce nominal 60 fps from 30 fps does not restore
motion detail. These can be explicit draft/export choices, not invisible default changes.

## Larger opportunities

1. **Retain full-resolution text, reduce work in photographic layers.** Prepare static color
   treatments once; render blurred backgrounds and bloom at lower resolution and composite them
   under full-resolution type and visualizers. Bloom already uses low-resolution prepared images.
   Further gains need theme-specific profiling because animated exposure, blend modes, arbitrary
   CSS overrides and backdrop filters can invalidate a cached layer.
2. **Share precomputed audio features.** Decode once outside the rendering tabs, compute a fixed
   feature timeline and serve bounded windows to every tab. Preserve off-grid smoothing queries,
   stereo energy, waveforms and the eight-second history contract. At 30 samples/s, 64 bins plus
   five scalar features in Float32 take about 29.8 MB/hour before indexing. Storing both 512-point
   waveforms adds 442 MB/hour, so retain windowed PCM or derive waveforms separately. This also
   enables the planned independent renderer, but the measured capture cost limits its standalone
   speed benefit.
3. **Avoid the JPEG screenshot round trip.** A renderer that paints DOM/CSS directly into an
   encodable canvas could avoid per-frame JPEG compression, base64 transport and JPEG decoding.
   Prototype this behind the renderer contract. Ordinary canvas-based DOM reconstruction does
   not support enough of Setcast's CSS: the documented limitations include backdrop filters,
   blend modes, several masks and SVG filters. See [client-side rendering limitations](https://www.remotion.dev/docs/client-side-rendering/limitations).
   Remotion also documents an experimental [HTML-in-canvas capture path](https://www.remotion.dev/docs/client-side-rendering/html-in-canvas)
   that uses native Chromium painting. It requires browser support and a flag, and can fall back
   to DOM reconstruction. A prototype must verify which path actually ran and compare every
   theme before claiming compatibility or speed. No speedup for this path was measured here.
4. **Parallelize chunks across machines.** This reduces elapsed time when more hardware is
   available, at the cost of distribution, asset transfer and orchestration. More local tabs
   already stopped helping in the measured GPU workload. A FOSS Playwright/Chromium/FFmpeg adapter
   is valuable for renderer independence, but swapping libraries while retaining the same
   screenshot transport is not by itself a performance optimization.

## Reproduce

```sh
vp run render-bench --help
vp run render-bench --from 84 --seconds 30 --repeat 2 \
  --variant baseline --variant jpeg-92 --variant veryfast \
  --variant jpeg-92-veryfast --variant hardware-12m \
  --out examples/demo/out/bench-long

vp run render-bench /path/to/project --from 108 --seconds 12 --repeat 2 \
  --variant baseline --variant fps-30 --variant jpeg-92 \
  --out examples/demo/out/bench-project

node packages/renderer-remotion/bench/scaling.ts --full
```

The scaling microbenchmark's `--full` run takes roughly two minutes on this machine. Without it,
the scheduler stops at 18,000 frames. It intentionally reads an internal function in the installed
renderer; inspect that dependency when updating Remotion.

Compare videos at matching presentation times, including transitions, dark gradients, text and
busy image regions. SSIM is a useful similarity check, not proof of perceptual equivalence:

```sh
ffmpeg -i reference.mp4 -i candidate.mp4 \
  -lavfi '[0:v]setpts=PTS-STARTPTS[ref];[1:v]setpts=PTS-STARTPTS[test];[ref][test]ssim' \
  -an -f null -
```

## Implementation and acceptance checks

Follow-up research on removing the image round trip, including Remotion version and theme
compatibility, is in [Capture without the JPEG round trip](capture-feasibility.md).

`output.profile: fast` selects JPEG quality 92 and x264 `veryfast`. Explicit quality settings
override those defaults. Standard quality remains JPEG 95, x264 `medium` and CRF 18. Hardware
encoding uses the profile's JPEG quality without an x264 preset.

CLI exports longer than 60 seconds now use bounded video-only chunks. Set `output.chunkSeconds`
to 1–60 to change their size, or 0 to disable them. Absolute frame ranges preserve the mix,
modulation, history queries and video loops. The master audio is encoded once in parallel with
the video, then the final mux copies the encoded streams. MP4/MOV use a 90 kHz movie timescale
so the final audio edit is not rounded to whole milliseconds. This uses Remotion's bundled
FFmpeg subprocess and requires no system FFmpeg installation.

A 65-second 1080p30 demo export (84–149 seconds) with the fast profile took **43 seconds** with
60-second chunks and **43 seconds** without chunks. Encoding audio only after video rendering
had taken 51 seconds; overlapping it removed that avoidable serial work. These are single
validation runs using rounded CLI times, including preparation, unlike the repeated benchmark
means above. They do not establish an hour-long speedup.

The final 65-second export has 1,950 frames with the expected presentation timestamps, starts
both streams at zero, and contains 3,120,000 decoded mono samples at 48 kHz. Source correlation
at 0.1, 59.96, 60.04 and 64.85 seconds found zero sample offset. A comparison of chunked and
unchunked video at matching times scored 0.998646 SSIM.

A more aggressive test used two-second chunks and a one-frame final chunk, beginning at frame
3,241. It produced 181 frames, with 0.995010 SSIM against the unchunked fast-profile reference.
Full-frame inspection at a join showed matching text, layout and spectrum. A 1080p60 export
with a looping video background produced exactly 361 frames and 288,800 decoded mono samples
at 48 kHz; source correlation around its join found zero offset and confirmed that the video's
own test tone did not enter the soundtrack.

Automated tests exercise partitioning at every supported FPS, partial final chunks, progress,
unchunked short exports, explicit opt-out, preserving an existing output after failure, and
cancelling the other worker when audio or video fails. Real bundled-FFmpeg tests cover MP4,
MOV and MKV; MP4/MOV decoded samples match a single reference encode of the source range,
including source audio that ends slightly before the last video frame.

Chunking bounds temporary JPEGs and per-render frame/asset history. Encoded chunks and the
soundtrack still grow with duration until final assembly. There is no resumable cache yet, and
Studio exports continue to use its own unchunked pipeline. The separate `render-bench` task
still measures direct Remotion calls so its original experiments remain comparable.

`vp run ready` passed for the implemented pipeline: formatting, lint, type checks, 288 tests
across 40 files, renderer dependency isolation, and the three-second smoke render.

## Original evaluation validation

`vp run ready` passed after restoring the production renderer: formatting, lint and type checks,
264 tests across 38 files, renderer dependency isolation, and the three-second smoke render.
The benchmark command also completed the longer demo and real-project sweeps above.

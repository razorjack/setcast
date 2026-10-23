# Browser exporter scheduling

Removing display refresh pacing from offline Chromium reduced the measured one-worker export
wall times by 22–33%, with all 3,600 compared decoded frames identical. Baseline revision:
5b24d4c, after branding and overlays. Remotion remains the default renderer.

## Change and measurements

The exporter now launches pinned Chromium with `--disable-frame-rate-limit`.
[Chromium defines this switch](https://chromium.googlesource.com/chromium/src/+/HEAD/components/viz/common/switches.cc)
to remove scheduler frame limiting and also disable GPU presentation synchronization. The
flag is scoped to the offline browser session. Live playback and independent preview retain
their normal browser scheduling.

Setcast still supplies absolute frame times and waits for two stable animation-frame callbacks,
React effects, asset holds, decoded images and fonts. JPEG quality, frame order, bounded capture
queue, encoder backpressure and output replacement behavior are unchanged. The adapter digest
already participates in resume identity, so existing checkpoints from the previous runtime
are invalidated automatically. There is no checkpoint format migration or new configuration.

The first branded 1080p/30 fps baseline spent 10.16 seconds in screenshot capture, 2.92 seconds
in readiness, 1.14 seconds in React commit, 0.67 seconds resolving frames and 0.024 seconds
preparing audio windows. Encoder pipe waits took 0.18 seconds. After the change, capture took
7.15 seconds and readiness 0.62 seconds. These timings supported changing capture scheduling;
shared audio caches and hardware encoding would not address the largest measured costs.

## Comparison

All runs used Apple M1 Pro, macOS Darwin 27, Node 26.7.0, Playwright 1.64.1 / Chromium
156.0.8078.4, ANGLE, FFmpeg 9.0.2, 1920×1080 at 30 fps, JPEG 95, CRF 18 and x264 medium.
Runs were sequential, with no other Setcast render jobs running during the measurements.
Wall times include browser/bundle setup, capture, encoding and final assembly.

| Scene | Duration | Workers | Baseline | Optimized | Reduction |
| --- | ---: | ---: | ---: | ---: | ---: |
| Branded demo, first pair | 10 s | 1 | 16.86 s | 11.60 s | 31.2% |
| Branded demo, repeat | 10 s | 1 | 16.93 s | 12.32 s | 27.2% |
| Branded demo | 10 s | 2 | 9.79 s | 9.38 s | 4.2% |
| Field with branding | 10 s | 1 | 17.00 s | 11.89 s | 30.1% |
| Constellation with branding | 10 s | 1 | 16.98 s | 11.94 s | 29.7% |
| Looping video with branding | 10 s | 1 | 31.71 s | 24.71 s | 22.1% |
| Branded demo | 60 s | 1 | 94.53 s | 63.45 s | 32.9% |

Every pair had identical decoded frames and captured JPEG byte totals. FFmpeg `framemd5`
compared every decoded video frame, including all 1,800 frames of the minute-long exports.
The two-worker difference is small and only measured once; do not treat it as a reliable
throughput gain beyond normal run-to-run variation. Parallel capture already overlaps waits.
These results describe this machine and these scenes, not all themes or hardware.

[Raw measurements](benchmarks/browser-scheduling-2026-10-22.csv) include summed stage times,
captured bytes, Node peak RSS and decoded-frame hash digests. Summed worker durations overlap
and are not wall time. Encoder writes measure pipe waiting, not encoder CPU. Audio preparation
excludes feature calculations performed during frame resolution/component rendering. Node RSS
excludes Chromium and FFmpeg and is not total render memory.

## Reproduce

Copy the generated `examples/demo` project, keep its theme, audio and art, and add:

```yaml
branding:
  logo: assets/logo.svg
  name: Null Vector
  event: Neurofunk Sessions
  episode: Episode 42
  messages:
    lines: [instagram.com/nullvector, Tracklist in the description]
    gap: 2
    seconds: 5
announcements:
  - {at: 35, text: Last track, seconds: 4}
```

Run the same command on baseline 5b24d4c and the optimized revision, with separate output paths:

```sh
node packages/renderer-browser/bench/export.ts path/to/branded-demo --seconds 10 --at 30 --concurrency 1 --out path/to/results
```

Repeat with `--concurrency 2` and `--seconds 60`. The GPU variants add
`visualizer: {name: field, seed: 42, resolution: 0.5}` or the same block with `constellation`.
The video variant replaces the background with a two-second 1080p/30 fps FFmpeg `testsrc2`
loop. Decode each pair with `ffmpeg -v error -i profile.mp4 -map 0:v -f framemd5 -` and compare
all frame rows. Do not compare only file sizes or container hashes.

Local JSON reports, MP4s and the case manifest are in
`examples/demo/out/renderer-optimization/` (gitignored).

## Validation and limits

Both exporter acceptance suites, same-page frame seeking, resume recovery and installed-package
smoke passed. Browser acceptance matched the previous theme reference stills exactly; delayed
logo readiness also passed. GPU checks passed for all three visuals, including shuffled seeks,
fresh workers, forced failures and live input. The ready check passed all 506 tests, lint, types,
the Remotion dependency check and smoke rendering.

The SwiftShader GPU check uses the same offline scheduling flag. Its performance measurement
now includes JPEG screenshot readback after readiness, reported as `captureFrameMs`. Readiness
alone can finish while drawing is still in flight, so the former `prepareMs` metric did not
measure completed software rendering and cannot establish export or live throughput.

Hardware/platform qualification remains local to the machine above; Linux and Windows drivers
and sustained multi-hour thermal behavior are not qualified.

## Shared FFT coefficient cache, 2026-10-23

Core's fixed 2048-point transform now computes its sine/cosine coefficients once per module.
The table contains 2,047 pairs of doubles, about 32 KiB plus small map overhead. Transform
ordering, normalization, edge padding and spectral smoothing are unchanged. This benefits all
consumers of core audio analysis, including live input and both exporters.

On the local Apple M1 Pro with Node 26.7.0, six alternating measurements of 4,000 transforms
had medians of 1,324.9 ms before and 1,170.4 ms after caching, an 11.7% reduction. Both versions
received 4,000 warmup transforms. A full-master export was running concurrently; this is a
microbenchmark under that load, not an exporter throughput result. Screenshot capture remains
the larger cost in the sustained export. [Raw measurements](benchmarks/spectrum-2026-10-23.json)
include every repetition, not only the median.

Reproduce from the repository root:

```sh
git show 5aedace:packages/core/src/spectrum.ts > /tmp/setcast-reference-spectrum.ts
node scripts/spectrum-bench.ts --reference /tmp/setcast-reference-spectrum.ts
```

The benchmark requires exact equality for 256 windows, including both file edges, before timing.
Existing transform tests, all 521 tests and ready passed. Both exporter acceptance suites passed.
A branded 1080p GPU frame from the real master also matched the pre-change decoded pixels exactly
(`96a12d9d5f875e7163dcd96c1e5831c8`, FFmpeg raw-frame MD5).

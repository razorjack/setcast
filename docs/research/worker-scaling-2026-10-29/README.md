# Automatic capture worker selection, 2026-10-29

The automatic-worker candidate was not promoted. It improved three measured workloads, but an
expanded moving-theme check found paint-history differences in thirteen of thirty-two cases.
A full-repaint candidate removed the differences in its first thirteen comparisons, then a
screenshot timed out. Production retains its one-worker default and existing capture behavior.

The rejected candidates, measurements, raw capture samples and failures are retained here.
This is a completed qualification investigation with an unresolved correctness prerequisite,
not a completed automatic scheduler or a current-upstream replacement benchmark.

## Measurements

Each workload exports demo seconds 90–100, 300 frames, with software H.264, CRF 18, x264 medium and
JPEG 95. Three alternating pairs use fresh browser sessions. The measured interval covers the
render call through session cleanup, including bundling, page startup, capture, encoding and mux.
Project loading, input hashing and full output verification are outside that interval. The Node
process and OS caches are shared. Host: Apple M1 Pro, 10 CPUs, 32 GiB RAM, Node 26.7.0, Chromium
156.0.8078.4, FFmpeg 9.0.2. Reports identify base revision `c08c0b3` and a dirty working tree; the
candidate patches and harness are committed with this report. Timing runs used the automatic
policy patch without the later repaint patch.

| Workload | One worker median (range), seconds | Automatic four workers median (range), seconds | Median reduction |
| --- | ---: | ---: | ---: |
| Standard demo | 9.721 (9.625–9.967) | 6.375 (6.372–6.547) | 34.4% |
| Tunnel GPU visual | 10.255 (10.210–10.341) | 7.682 (7.473–8.722) | 25.1% |
| Looping 1080p25 video | 21.258 (21.252–21.392) | 11.422 (11.315–11.467) | 46.3% |

[Standard](standard.json), [GPU](gpu.json) and [video](video.json) reports retain every run,
actual graphics/encoder decisions, selected and active workers, decoded hashes, output sizes,
system CPU and process-tree samples. All 5,400 decoded frames participate in the hash comparisons.
The video source is a 1.2-second FFmpeg testsrc2 loop at 25 fps; output remains 30 fps. The GPU
fixture adds `visualizer: { name: tunnel }` to the copied demo. Both retain the demo theme and audio.

Sampled process-tree peak RSS increased with worker count: the largest recorded value was
1,892 → 2,814 MiB for standard, 1,817 → 2,710 MiB for GPU, and 2,025 → 2,996 MiB for video. These
are sums over Node and descendants, can double-count shared pages and are not physical-memory
measurements. The policy's memory estimate is not a hard allocation limit.

## Concurrent load and retained failed attempts

The [initial exploration](exploratory.json) used 1/2/4 workers, with mean external process CPU
varying by roughly 1.1–4.3 cores. All decoded video hashes matched, but those timings are retained
as exploration. A repeat was launched before its preceding idle result was read. That idle sample
was 69.6% system busy, so the repeat was stopped after one completed export. Its original
[aborted report](aborted-repeat.json) remains unmodified, including its unfinished `running` status.

The final harness waits for a five-second system-CPU sample at or below 20% before each arm,
with a bounded sixty-second wait. Load logs are retained for [standard](standard-load.txt),
[GPU](gpu-load.txt) and [video](video-load.txt). The GPU run waited through 58–78% busy samples;
the video run also delayed two arms. The other project was not stopped or modified.

A quiet pre-run interval does not guarantee quiet execution. Reports retain per-run observations.
Mean external CPU during the final video runs was 0.98–1.37 cores for one worker and 1.51–2.43
cores for automatic capture. External includes system GPU/media services and unrelated processes;
it does not identify another project's activity. The three automatic video times remained close.
No performance tests ran concurrently with Setcast's validation suites.

## Candidate policy and recovery

In the archived automatic-policy candidate, exports below 300 frames keep one worker. Longer exports select the largest of 1/2/4 that fits
half the available CPU count and a quarter of stable host/process memory. The selection estimate
is 512 MiB shared plus 512 MiB and 48 bytes per output pixel per worker. It always permits one
worker. Explicit `--concurrency 1..8` bypasses the estimate; no export opens more pages than frames.
Encoder threads and actual native/GPU allocations are not constrained by this estimate.

The decision is made once, before cache/checkpoint identity. Transient CPU load and free memory
do not participate. Per-job empirical calibration is still a possible follow-up, contingent on
showing a net gain after calibration cost and preserving stored-job identity. This change does
not claim to find the fastest worker count for arbitrary scenes or hardware.

The [recovery report](recovery.json) records a 300-frame automatic export, a zero-capture repeated
export, cache reuse with the same count explicitly selected, an independent fresh render, and
interruption after the first thirty-frame chunk. Resume reused thirty frames and captured 270.
Every resulting decoded video/audio framemd5 matched the original. Interruption preserved the
existing destination. Actual worker selection and zero capture pages on cache hits are recorded.

## Moving-theme failures and paint investigation

The [complete moving-theme report](worker-frames.json) compares all 45 frames of a 1–2.5 second
slice with one and four workers, for every built-in theme in 1920×1080 and 1080×1920. Thirteen
cases differ. The [log](worker-frames.txt) retains the failing assertion; these checks were not
weakened to pass. Differences occur in Bristol portrait, both Patina/Quicksilver/Afterhours/
Passe-Partout/Darkroom orientations, Pirate landscape and Anamorphic landscape. Their complete
MP4 artifacts remain locally under `examples/demo/out/worker-frames-2026-10-29/`.

Direct captured JPEG checks separated capture from H.264 prediction:

- [Passe-Partout](capture-passe.json): fresh one-worker repeats matched exactly. Four workers
  differed on absolute frames 32–37, around a thin tracklist progress line. Full-frame RGB RMS
  was 0.024–0.035 channel levels, maximum difference 3–11 after JPEG. The changed rectangle was
  x=1408..1783, y=368..383. [One-worker](passe-one-worker.jpg) and
  [four-worker](passe-four-workers.jpg) frame 33 are retained.
- [Afterhours](capture-afterhours.json): fresh one-worker repeats matched exactly; four workers
  differed on nine captured frames. Those differences have not all been characterized numerically.
- [Local repaint experiment](capture-passe-repaint.json): temporarily removing/restoring the body
  layout box before capture eliminated all Passe-Partout differences. React and decoded assets
  remained mounted. This points to paint-history reuse; it does not establish every failure's cause.

The shared-driver [repaint patch](repaint.patch) then passed thirteen complete theme/aspect
comparisons with identical decoded hashes. Its next case, Bunker portrait, failed during a
screenshot with `Timeout 30000ms exceeded`. The [partial report](worker-frames-repaint-partial.json)
and [failure log](worker-frames-repaint.txt) are retained. The timeout cause has not been isolated;
it is not proof that repainting caused it. The candidate is nevertheless unqualified and was
removed from production. Same-page backward seeking, font changes and video loops passed during
that candidate, but do not override its incomplete broader check. No final throughput claim is
made for the repaint candidate.

## Reproduction and final state

The [automatic policy patch](automatic-policy.patch) contains the proposed implementation, focused
policy tests and the scheduling recovery harness. It applies to the final production source from
this investigation. Apply it explicitly before reproducing automatic-four-worker measurements;
without it, `--workers auto` exercises the unchanged one-worker default. Apply `repaint.patch`
separately only to reproduce that rejected experiment. Both patches are research artifacts.

```sh
git apply docs/research/worker-scaling-2026-10-29/automatic-policy.patch
node packages/renderer-browser/bench/scaling.ts examples/demo --seconds 10 --repeat 3 --workers 1,auto --idle-busy .2 --out NEW_DIRECTORY
node packages/renderer-browser/bench/scheduling.ts --out NEW_RECOVERY_DIRECTORY
node packages/renderer-browser/bench/worker-frames.ts --out NEW_THEME_DIRECTORY
vp run export-acceptance --adapter ./packages/renderer-browser/src/export/index.ts --out NEW_BROWSER_DIRECTORY
vp run export-acceptance --out NEW_REMOTION_DIRECTORY
vp run package-smoke --browser
vp run ready
```

The production change retained from this investigation is CLI reporting of actual capture-worker
counts, including zero workers on full cache hits. Production scheduling and painting are unchanged.

The standard/GPU/video performance findings apply to the pre-repaint candidate on this host.
4K, 60 fps, sustained thermal behavior, hardware-encoder throughput, other platforms and arbitrary
plugins remain outside this performance comparison. Full replacement still needs matched-quality
current-upstream comparisons, selective reuse and independent distribution qualification.

Final production verification passed `vp run ready` (661 tests in 108 files, check, ban-check and
decoded smoke) and `package-smoke --browser` after removing both experimental production changes.
The qualification failures above remain unresolved. Both archived patches passed `git apply --check`.

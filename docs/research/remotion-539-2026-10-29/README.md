# Current Remotion baseline, 2026-10-29

Remotion 4.0.539 completes the tested export and injected encoder-failure scenarios with its
own Chromium 157.0.8080.0 and shared-memory FFmpeg input. The old 4.0.534 result with shared
memory disabled does not describe this configuration. Production remains pinned to 4.0.513.

The isolated checkout starts at `e784714`. [trial.patch](trial.patch) retains its exact dependency
and observation changes, including the lockfile and fault harness. Apply it to that revision
and install with pnpm. Neither the private parallel-encoding heuristic nor process-wide rejection
handling is modified. Browser export uses Playwright 1.64.1 / Chromium 156.0.8078.4. Both adapters
report Apple M1 Pro Metal and two capture workers. These are macOS observations only.

## Reproduction and evidence

From the isolated checkout, with the generated demo assets available:

```sh
node scripts/render-compare.ts /path/to/demo --at 90 --seconds 30 --repeat 3 \
  --concurrency 2 --out /path/to/new-comparison
node scripts/export-acceptance.ts --out /path/to/new-acceptance
node packages/renderer-remotion/bench/encoder-failure.ts --project /path/to/demo \
  --out /path/to/new-failure
```

[standard.json](standard.json) retains all three alternating pairs, source identity, runtime
pins, CPU observations and decoded-output verification. The original MP4s remain in
`examples/demo/out/remotion-539-standard-2026-10-29`; they are not committed. All six outputs
fully decode to 900 H.264 frames with AAC audio. The standard export-acceptance suite also passed,
including A/V pulse alignment, media readiness, themes, GPU visualizers, cancellation and asset
failure. Its local log is `/tmp/setcast-remotion-539-acceptance.log`.

| Adapter | Median wall time | Full range | Approximate output size |
| --- | ---: | ---: | ---: |
| Browser | 21.508 s | 20.934–21.672 s | 13.65 MB |
| Remotion 4.0.539 | 34.011 s | 33.706–36.265 s | 8.68 MB |

These timings include loading through cleanup, using the unchanged standard profile at
1920×1080/30 fps and two workers. The browser was already installed. An earlier two-second
exercise downloaded Remotion's browser and is excluded from timing conclusions. Both use
libx264, but browser supplies JPEG through `image2pipe` and Remotion supplies raw frames through
`remotionshm`. Browser builds, image conversion and file sizes differ. Equal CRF is not equal
perceptual quality. This single scene does not establish the plan's matched-quality speed target,
a concurrency optimum or a cross-platform advantage. System CPU samples include other jobs;
there is no process-tree attribution in this report.

[encoder-failure.json](encoder-failure.json) records an invalid encoder argument on the second
one-second chunk. Node caught the shared-memory ACK-pipe error under normal rejection policy,
the existing destination survived and no temporary render directories remained. The first harness
attempt matched a filename that this upstream path does not use, injected no fault, and is excluded.
The retained harness counts actual video encoder invocations instead.

**Named shared-memory cleanup remains unverified on 4.0.539.** Earlier research at branch
`prototype/native-capture`, commit `308b1cc`, found POSIX pool leaks on some equivalent failures
with 4.0.535 even when destination and temporary-directory checks passed. That branch's
`docs/shared-memory-capture-results.md` and failure CSV retain its exact method and results.
Do not infer a current leak or complete resource cleanup from the filesystem check alone.

## Prior native-capture research

The same branch retains `docs/native-capture-results.md`, its native prototype at `b5de1de`, and
committed benchmark CSVs. HTML-in-canvas/WebCodecs reduced sampled memory with one page but did
not beat the tested practical parallel screenshot exporter. It rejected per-play backgrounds
because adaptive panels differed. Encoder preferences were not verified hardware identities,
and bitrate was not quality-matched to CRF. The prototype still uses Remotion orchestration.
These constraints support retaining the independent JPEG path while profiling specific costs;
they do not justify copying an experimental renderer into the production browser adapter.

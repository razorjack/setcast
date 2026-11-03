# macOS follow-up after Linux qualification

The shared live sequence fix passes on macOS. Quicksilver looping-video worker parity fails
on Apple M1 Pro Metal, including 1080×1920 output. No production repair is promoted from this
session. Successful baseline, broad video and installation checks must not conceal this narrower
failure. Main still uses Remotion by default.

Production source is `ec1d84d`, including the four Linux fixes. The local browser-first candidate
merges that source as `4fadfd0`; its renderer and theme source matches production exactly. The
Linux candidate object `166e51d` was not available in this macOS repository, so the existing local
candidate was updated without claiming the same revision. Documentation changes during this
session do not change the tested renderer source. See [host identity](host.json).

The host is Apple M1 Pro, macOS Darwin 27.0.0 arm64, 10 logical CPUs, 32 GiB RAM, Node 26.7.0,
Chromium 156.0.8078.4 and system FFmpeg 9.0.2. Active export WebGL reports ANGLE Metal. The Linux-only
font-hinting and automatic-backend changes leave macOS launch policy unchanged. Raw outputs are
under `examples/demo/out/macos-followup-2026-11-03`; compact reports, commands and reproductions
are retained here. No hosted CI, push or external publication was performed.

## Completed checks

| Check | Outcome |
| --- | --- |
| Production `ready` | Formatting, lint/types, 688 tests in 115 files, dependency isolation and decoded smoke pass. |
| Browser and Remotion acceptance | Both pass, including media/readiness, themes, GPU visuals, failed export and cancellation recovery. |
| Shuffled video-frame comparisons | All 64 theme/orientation/fit cases pass at the existing tolerances, including seeks, loops and 25-to-30/60 fps conversion. |
| Quicksilver static worker repetition | All eight cases across four rounds and two orientations have exact decoded equality across 1/2/4 workers. |
| Quicksilver demo still | Inspected at 110.4 s: art, orb, typography and layout remain intact. A static still does not qualify video motion. |
| Live sequence | Three unchanged full harness runs pass dwell, loop, hold/skip, manual takeover, malformed-art failure, journal and restart checks. |
| Live output, energy and MIDI | All affected synthetic checks pass. |
| Browser-first candidate | Baseline and both exporter acceptance suites pass. Both fresh tarball installation paths pass at committed revision `4fadfd0`. |

The [browser-only installation](candidate-installed-browser.json) contains no Remotion packages;
the [compatibility installation](candidate-installed-compatibility.json) separately validates and
renders with the optional adapter. Both exercise all themes, playback, stills, video, cache/resume,
preview exports, ProRes and default clip/bundle workflows. These fixtures do not contain the
failing repeated Quicksilver video worker matrix. See [command outcomes](check-index.json) and
[source provenance](source-provenance.json).

The live checks qualify the shared control fix on this host. They do not repeat full live
endurance, repair the Linux software preset's dropped samples, or qualify physical input/OBS
latency. Linux evidence remains in its original report without rewriting historical outcomes.

## Quicksilver video failure

The unchanged Linux looping-video reproducer uses a generated 25 fps test pattern, a 30 fps
composition and frames 30–74. The first landscape round at 640×360 has exact decoded equality.
The first 360×640 portrait round produces different hashes for one, two and four workers and
fails its exact assertion. An independent 1080×1920 run also fails exact worker equality.
See [original export](video-workers-failed.json) and [full portrait](video-workers-hd-failed.json).

Lossless source captures compare one-worker repeats and 2/4 workers over all 45 frames, giving
135 comparisons. Differences reach two 8-bit channel levels and 1,500 changed pixels per frame.
The existing budget at 360×640 is one level on at most three pixels, so this is a source failure,
not merely H.264 inter-frame prediction. A one-worker repeat also differs; forcing concurrency
one is not a proven workaround. See [source summary](portrait-source-summary.json) and
[all source comparisons](portrait-source.json).

A separate diagnostic hashes each prepared BMP after PNG capture. All prepared-image hashes
match for every frame across the four capture groups while PNG hashes differ. The variation
therefore occurs after media preparation. The inspected frame 43 difference lies inside the
video orb. The preserved [reference](portrait-reference-43.png) and
[difference amplified 127 times](portrait-difference-43-x127.png) show its location, not its normal
visibility. See [asset identities](prepared-assets.json) and [summary](prepared-assets-summary.json).

## Experiments and decisions

All overrides below are confined to diagnostic fixtures or browser launch wrappers. Production
CSS, flags and assertions are unchanged.

| Experiment | Evidence | Decision |
| --- | --- | --- |
| Remove `will-change` in the fixture | All 135 source comparisons are exact in that run. | Do not remove the shared hint: it repairs a retained Linux clip defect. |
| `will-change: filter` | Source comparisons fail. | Rejected. |
| `will-change: opacity` | One source matrix is exact and four encoded shape/round cases pass; the third landscape round then fails exact decoded equality. | Rejected as a proven repair. |
| `--disable-gpu-rasterization` | Prepared BMP and PNG hashes match; all six repeated encoded shape cases and the full portrait case have exact worker equality. WebGL remains ANGLE Metal. | A useful diagnostic, not a qualified global production policy. |

The opacity experiment also changes rasterized pixels against the no-hint control: inspected
frame 43 has maximum difference 35 and mean 0.074 channel levels. Its initial repeatability pass
did not establish cross-version fidelity. The original assertion failures and all experiments
remain retained, including the failed opacity export.

The GPU-rasterization experiment repairs this reproducer, but changing a global launch flag
also changes other scenes. Three quiet alternating pairs on each of the existing standard,
Tunnel and looping-video corpus fixtures measure its cost:

| Fixture | Existing policy median (range), seconds | GPU rasterization disabled median (range), seconds |
| --- | --- | --- |
| Standard | 7.375 (7.341–7.782) | 10.055 (9.918–10.308) |
| Tunnel | 7.781 (7.762–8.164) | 10.855 (10.256–10.974) |
| Looping video | 14.923 (14.482–15.180) | 21.686 (21.472–21.686) |

These use 1080p30, frames 2700–2999, four explicit workers, software H.264, JPEG 95 / CRF 18,
the medium preset and fresh sessions. Timings run from the render call through cleanup, excluding
project preparation, input hashing and decoded verification. Every arm passes the unchanged
15% pre-run CPU-busy limit; no own validation runs concurrently. Reports retain observed load,
process resources and active runtime identity. The benchmark's first launcher failed to resolve
the themes package and rendered nothing; the corrected attempt retains all 18 completed outputs.

Each mode has identical decoded video hashes across its three repetitions within a fixture,
but the two modes differ. These are measurements at the same authored settings, **not matched-quality
performance evidence**, and they do not compare against Remotion. No lossless-reference quality
calibration of the global flag was completed. The flag increases measured time in every fixture
and has broader fidelity implications, so it was not adopted as a default. See
[raw measurements](raster-timing.json) and [summary](raster-summary.json).
The [diagnostic chart](raster-cost.html) shows the medians and ranges. A post-run
[input audit](timing-input-audit.json) confirms all three fixture identities still match all
18 runs. Each mode's repeatability does not establish equivalence between modes.

## Reproduction and next work

From the repository root with dependencies, pinned Chromium and FFmpeg available:

```sh
mkdir -p examples/demo/out/macos-quicksilver-repro
cp docs/research/macos-followup-2026-11-03/reproduction/quicksilver-video-workers.mjs.txt examples/demo/out/macos-quicksilver-repro/check.mjs
node examples/demo/out/macos-quicksilver-repro/check.mjs examples/demo/out/macos-quicksilver-repro/run-1
```

Use a new output directory for each attempt. The imports rely on the shown directory depth.
The script generates its own media and fails on any decoded worker mismatch. The archived
`portrait-source.mjs`, `video-assets.mjs` and browser wrappers retain the narrower diagnostics;
their fixture paths point to this session's original raw directory and must be adjusted for a
new fixture. Source diagnostics report `qualified: false` without necessarily exiting nonzero;
read that field, not only the launcher status. The encoded reproducer asserts exact equality.

The next repair must retain Linux clip stability and macOS worker determinism. Investigate
compositor/raster behavior with the preserved bitmap identities; do not reopen video decoding
without contrary evidence. Any global graphics policy needs the all-theme/frame/readiness and
GPU checks, lossless-reference fidelity review, and isolated cost measurements before promotion.
A shared theme change needs focused Linux repetition as well. Do not relax the precision budget,
drop portrait cases, or call a single passing hint experiment qualified.

Windows qualification, Linux real-master resources, the unchanged first-export performance target,
Linux software-live drops and upstream shared-memory failure cleanup remain separate outstanding
items. This macOS follow-up does not supersede those findings.

Final `vp run ready` passes all 688 tests, formatting, lint/types, dependency isolation and decoded
smoke; see [the final log](final-ready.txt). The [artifact manifest](artifact-manifest.json) retains
raw file sizes and SHA-256 hashes, including failed runs and diagnostic images. A successful
baseline does not override the explicit Quicksilver fidelity failure above.

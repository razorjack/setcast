# Portable replacement corpus v1

The cases below fix the workload definitions before their comparative results. They instantiate
the categories in the replacement plan; they do not remove the existing all-theme correctness
checks or the separate long real-master requirement. The one-second demo calibration is a
settings experiment and is not one of these comparative results.

Generate the corpus from the repository root after `vp run demo-assets`:

```sh
node packages/renderer-browser/bench/replacement-corpus.ts --out examples/demo/out/replacement-corpus-v1
```

The output directory must be new. The generator copies generated demo audio and art, creates a
three-second looping video from that art, writes explicit project configurations, loads every
project through public core/theme entry points, and records resolved project and asset digests.
Synthetic branding, overlapping plays and changing art are portable fixtures. They do not
represent a recorded DJ performance. The generation manifest records FFmpeg and source revision;
retain the generated manifest with results because encoded fixture bytes may vary by FFmpeg build.

| Case | Theme/content | Dimensions / FPS | Start / duration (seconds) |
| --- | --- | --- | --- |
| standard | Sterile Tech | 1920×1080 / 30 | 90 / 10 |
| css-filters | Afterhours typography, filters and glow | 1920×1080 / 30 | 90 / 10 |
| field | Field WebGL visualizer | 1920×1080 / 30 | 90 / 10 |
| tunnel | Tunnel WebGL visualizer | 1920×1080 / 30 | 90 / 10 |
| constellation | Constellation WebGL visualizer | 1920×1080 / 30 | 90 / 10 |
| looping-video | Three-second moving-art loop | 1920×1080 / 30 | 90 / 10 |
| dj-art-branding | Overlapping credits, art change, tracklist, branding and announcement | 1920×1080 / 30 | 102 / 10 |
| portrait | Afterhours with the same editorial transitions | 1080×1920 / 30 | 102 / 10 |
| 60fps | Sterile Tech | 1920×1080 / 60 | 90 / 6 |
| 4k | Sterile Tech | 3840×2160 / 30 | 90 / 3 |
| chunk-boundary | Editorial fixture across a 60-second chunk join | 1920×1080 / 30 | 88 / 63 |

Every project uses x264 medium, CRF 18, JPEG 95 and 60-second chunks as authored defaults.
Comparison overrides must appear in each report. Browser JPEG 100 / CRF 16 is the next quality
candidate from the calibration; it is not assumed qualified for these cases. The initial current
Remotion baseline is CRF 18 with its native capture path when actually selected. Automatic
concurrency is observable, not presumed optimal. Retain explicit-worker tuning runs before
calling a baseline tuned.

First capture each lossless reference and verify source/decoded RGB equality. Compare both
adapters against that reference using exact project, asset, frame-range and output identities.
Inspect the full frame and credit/branding/tracklist regions. Report mean, minimum and p05
RGB PSNR/SSIM and VMAF NEG, encoded bytes, and the actual color tags. Do not accept a setting
from one favorable metric or lower fidelity to reach a speed target. Missing content, frame
misalignment or an identity mismatch fails the comparison independently of aggregate scores.

Only then run at least three alternating timing pairs per case with the unchanged 15% pre-run
CPU limit, no concurrent validation, and retained process/load reports. A busy-period failure
retains partial runs; a later attempt uses a new output directory. Report every case and spread.
Quality generation and metric computation run outside timed intervals. Cold preparation,
repeated cache hits and incremental edits remain separately identified workloads.

The long real master stays local and outside the portable fixture generator. Re-run its
sustained export against the final driver, verify bounded memory and full decoding, and retain
multiple timing runs before a general long-export claim. Plan disk space before generating
long lossless references: sequential FFV1 can be much larger than the delivery encode. Selected
reference windows do not establish whole-master pixel fidelity and must be labelled as samples.

No result, platform qualification or speed target is implied by this corpus definition.

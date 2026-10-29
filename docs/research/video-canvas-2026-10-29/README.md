# Direct decoded canvas experiment

Decision: reject this candidate as a production default. Removing PNG serialization reduced
readiness work but increased screenshot cost, and the resulting frames failed fidelity checks.
Production `ExportVideo` remains unchanged. This directory preserves the candidate and measured
evidence so follow-up work can reproduce the failure without reconstructing the session.

Environment: Apple M1 Pro, macOS, Node 26.7.0, Playwright Chromium 156.0.8078.4, ANGLE Metal.
The patch applies to `ca34684`. It replaces decoded-video PNG images with copied display canvases
and retains the image path for CSS selectors that depend on element types. The image reference
is the compatibility path inside that candidate, selected by an additional nonmatching `img`
selector. The test pattern is generated locally with FFmpeg; no user media is in these reports.

## Results

The matrix includes all 16 themes, 640×360 and 360×640, cover/contain, frames 29, 36, 7, 0, 29,
and a 25 fps source at 30 fps output. An additional sterile-tech case uses 60 fps output.
There are 325 frame comparisons. Pirate and anamorphic conservatively use the image path.

The exploratory bounds were maximum absolute RGB-channel difference 8, mean 0.1 and RMS 0.5,
all on a 0–255 scale. These were investigation thresholds, not a new public fidelity promise.
186 comparisons exceeded them. Escapement portrait reached 134 maximum; its text and thin lines
differed visibly under close inspection. The worst RMS was 2.204 for sterile-tech portrait
contain. Mounting the canvas anew every frame and using a software-backed 2D context did not fix
escapement. The image-to-image control passed all 25 selected comparisons, with exact equality.

Two independent series each ran three alternating pairs at 1920×1080, 30 fps, one worker and
90 output frames. The 1920×1080 test-pattern source is 25 fps and loops after 1.2 seconds.
Every output passed H.264/AAC, dimensions, frame-rate, frame-count and full video-decode checks.

| Series | Canvas median wall time | Image median wall time | Canvas median screenshot total | Image median screenshot total |
| --- | ---: | ---: | ---: | ---: |
| Initial | 7.803 s | 6.899 s | 2.948 s | 1.803 s |
| Repeat | 7.819 s | 6.967 s | 2.956 s | 1.833 s |

In the initial series, median readiness fell from 4.070 s to 3.827 s, while screenshot time rose.
Canvas was slower in all six paired comparisons. Do not generalize this short workload to every
video, platform or capture transport. Timings include fresh renderer sessions, shared process/OS
caches and ordinary workstation activity. Reports retain system CPU samples, which include the
renderer and other applications. The repeat ran without this session's validation tasks. The
later harness adds an untimed canvas-presence check; recorded profiles predate that extra check.

The result rejects the assumption that eliminating an intermediate image automatically improves
end-to-end export. A different capture transport may change the tradeoff. Type-selector fallback,
correct frame ownership and matching mount lifecycle alone do not establish pixel parity.

## Reproduce

Use a disposable checkout with the same dependencies and browser. The matrix is expected to fail
for this candidate. Do not apply the patch to a checkout containing unrelated video changes.

```sh
git apply --check docs/research/video-canvas-2026-10-29/candidate.patch
git apply docs/research/video-canvas-2026-10-29/candidate.patch
node packages/renderer-browser/bench/video-frames.ts --out examples/demo/out/video-canvas-new
node packages/renderer-browser/bench/video-frames.ts --theme escapement --image-only \
  --out examples/demo/out/video-control-new
node packages/renderer-browser/bench/video-profile.ts --out examples/demo/out/video-profile-new
git apply --reverse docs/research/video-canvas-2026-10-29/candidate.patch
```

The matrix stores PNG pairs and partial JSON reports as it progresses. PNG decoding uses temporary
files and a 10-second FFmpeg timeout because an earlier stdin-based synchronous comparison stalled.
The profile requires a new output directory. It stores every completed arm, preserves metrics
separately from wall time, and checks decoded outputs outside the timed interval.

`matrix.json`, `remount.json`, `software-canvas.json` and `image-control.json` preserve fidelity
results. `profile.json` and `profile-repeat.json` preserve timings and stream verification.
The patch records the persistent-canvas variant; the remount and software-backed variants are
the two small changes described above. Local failure images remain in `examples/demo/out`.

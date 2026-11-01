# Bitmap video timing, 1 November 2026

Three alternating pairs of complete ten-second looping-video exports pass the 15% pre-run
CPU-busy requirement. No own validation job ran concurrently. Baseline 8d00d33 uses PNG video
frames; candidate 1db55ff uses BMP V4 blob URLs. Both use one worker, JPEG 95, CRF 18, the same
frozen 1080p30 project and Chromium 156. All six decoded video hashes and project/asset identities
match. Reports retain external CPU, process memory and actual runtime observations.

Baseline median is 34.248 seconds (34.237–34.371); bitmap median is 26.325 seconds
(26.194–26.350), a 23.1% reduction. Timing covers the render call through session cleanup;
project loading, input hashing and decoded verification are outside it. This measures the
video-frame representation change, not an advantage over current Remotion. Automatic-worker
throughput and full-master resource behavior still require qualification before promotion.

The existing candidate evidence separately checks 288 exact source frames, all themes/aspects,
source switches, decoded PCM equality and 3,000 captures with released URLs. This timing series
does not replace those checks or establish sustained memory limits.

Each pair alternates fresh processes/checkouts, reversing order in the second pair:

```sh
node packages/renderer-browser/bench/scaling.ts FROZEN_LOOPING_VIDEO_PROJECT --at 90 --seconds 10 --repeat 1 --workers 1 --idle-busy .15 --out NEW_DIRECTORY
```

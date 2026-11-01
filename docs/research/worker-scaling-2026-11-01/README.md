# Automatic-worker timing qualification, 1 November 2026

Three alternating one/automatic pairs completed for each frozen standard, tunnel and looping-video
fixture at 1080p30, 90–100 seconds. Automatic selection chose four workers on the M1 Pro/32 GiB
host. Every arm passed the pre-run CPU-busy limit of 15%; rejected busy samples waited without
stopping other processes. No other Setcast correctness workload ran during timing. Raw reports
record external CPU observations, summed process-tree RSS, actual runtime decisions and hashes.

| Fixture | One-worker median | Automatic median | Reduction | One-worker range | Automatic range |
| --- | ---: | ---: | ---: | ---: | ---: |
| Standard | 10.690 s | 7.169 s | 32.9% | 10.649–10.789 s | 6.919–7.348 s |
| Tunnel | 11.059 s | 7.531 s | 31.9% | 11.056–11.282 s | 7.473–7.746 s |
| Looping video | 34.315 s | 20.065 s | 41.5% | 34.245–34.479 s | 19.961–20.155 s |

Each fixture has one decoded video hash across all six outputs. This checks complete video
equality between worker settings, including repeated fresh sessions. Existing scheduling acceptance
separately checks cached/repeated jobs and exact video/audio checkpoint recovery. Full-master
resource qualification and comparisons against current Remotion remain separate requirements.

The measured interval is the render API call through session cleanup. Project loading, identity
hashing and decoded verification are outside it; shared OS/process caches remain. These are local
scheduling improvements at unchanged JPEG 95 / CRF 18, not matched-quality Remotion speed claims.
Summed process RSS can double-count shared pages; external GPU/encoder services are excluded.

The runtime is the committed `renderer/upstream-539-comparison` revision 6c373c0, including the
readiness fix and candidate automatic scheduler. Its browser rendering code uses Playwright
Chromium 156; the installed Remotion adapter was not invoked by these measurements. The scheduler
chooses 1/2/4 workers from stable CPU/memory limits and one below 300 frames, retaining explicit
1–8 overrides. It freezes selection before cache/resume identity. Estimates are not allocation
limits. The earlier busy/partial attempts remain in the 31 October research directory.

Reproduce from the candidate runtime with:

```sh
node packages/renderer-browser/bench/scaling.ts FROZEN_PROJECT --at 90 --seconds 10 --repeat 3 --workers 1,auto --idle-busy .15 --out NEW_DIRECTORY
```

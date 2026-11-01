# Automatic-worker bitmap throughput, 1 November 2026

Three alternating pairs qualify the bitmap-video candidate e388178 against PNG baseline 5d5349f.
Both use the frozen looping-video fixture at 90–100 seconds, 1080p30, JPEG 95 / CRF 18 and four
automatically selected workers. All six decoded video hashes, input identities and encoded file
sizes match. Both checkouts are committed and clean. Each arm passes the unchanged 15% pre-run
CPU-busy threshold; no own validation job runs concurrently.

Median render-call wall time falls from 20.373 to 13.713 seconds, a 32.7% reduction.
PNG spans 20.303–20.401 seconds; bitmap spans 13.136–14.272 seconds. The boundary includes session
setup, capture, encoding and cleanup, and excludes project loading, input hashing and decoded
verification. This is an improvement over Setcast's PNG video preparation, not a new comparison
against Remotion or a general claim for all projects.

The first attempt at the third PNG arm stays above 15% CPU busy for all twelve samples and stops
before export. Its failed JSON and log are retained. The retry uses a new directory. Other arms
also wait through load spikes before starting. Reports retain observed system and external CPU;
external processes and GPU/OS services are not attributed to the user's parallel project.

Together with the exact 288-sample image checks, complete source-switch video/PCM equality,
3,000-capture URL ownership check, full 56-minute master qualification and latest-main ready,
both exporter acceptance suites and installed-package checks, this completes the bitmap promotion
requirements. The screenshot transport, quality defaults and renderer selection remain unchanged.

```sh
node packages/renderer-browser/bench/scaling.ts FROZEN_LOOPING_VIDEO_PROJECT --at 90 --seconds 10 --repeat 1 --workers auto --idle-busy .15 --out NEW_DIRECTORY
```

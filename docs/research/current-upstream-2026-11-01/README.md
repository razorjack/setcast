# Current-upstream timing, 1 November 2026

The browser renderer misses the 30% wall-time reduction target in all three measured workloads.
Do not promote the browser-first default on this evidence. These are three alternating pairs per
1080p30 fixture, 90–100 seconds, from committed runtime 6c373c0. Each run passed the 15% pre-run
CPU-busy limit; no own correctness job ran concurrently. Reports retain external CPU observations.

| Fixture | Browser median | Remotion median | Browser wall-time change |
| --- | ---: | ---: | ---: |
| Standard | 9.781 s | 7.791 s | +25.5% |
| Tunnel | 10.792 s | 8.697 s | +24.1% |
| Looping video | 21.575 s | 12.811 s | +68.4% |

Browser uses four automatic workers, Chromium 156, JPEG 100 and CRF 16. Remotion 4.0.539 uses
five automatic workers, Chromium 157, shared-memory input and CRF 18. Both use libx264 and ANGLE
Metal. The reports include actual runtime observations. Timings cover the render call through
cleanup; project preparation and decoded verification are outside that interval.

The settings come from the frozen corpus quality qualification. Every browser output has the
same decoded hash as its corresponding qualified one-worker quality output. Remotion automatic
outputs have two distinct hashes per fixture across the three runs, neither matching the earlier
one-worker quality output. Therefore this is a comparison at calibrated settings, with confirmed
browser quality retention, not a newly qualified matched-quality comparison of every automatic
Remotion output. `quality-provenance.json` preserves that distinction. The negative result remains
relevant and does not justify changing the target or claiming a speed advantage.

Reproduce in the committed comparison checkout:

```sh
node scripts/render-compare.ts FROZEN_PROJECT --at 90 --seconds 10 --repeat 3 --browser-concurrency auto --remotion-concurrency auto --browser-crf 16 --browser-jpeg-quality 100 --remotion-crf 18 --idle-busy .15 --out NEW_DIRECTORY
```

# Direct screenshot transport experiment

This isolated candidate tests `SETCAST_CAPTURE_EXPERIMENT=screenshot|jpeg|png`. The default is
the unchanged Playwright screenshot control. The other modes use one CDP session per page and
`Page.captureScreenshot` after the existing readiness and paint-invalidation protocol. JPEG uses
the configured quality; PNG enables `optimizeForSpeed`. No DOM reconstruction or native canvas
capture is involved. Production main does not expose these experimental modes.

The selected mode participates in checkpoint/cache identity and actual capture reporting. PNG
input uses explicit RGB to full-range BT.601 conversion, with BT.709 primaries and sRGB transfer
metadata, before H.264 encoding. That conversion requires decoded color and playback checks;
a metadata tag alone does not qualify it. Every stream keeps one mode throughout the process.

`bench/direct-capture.ts` compares independently prepared pages at ordered and shuffled absolute
frames, across all themes and both orientations. JPEG compares against Playwright JPEG 95; PNG
compares against lossless Playwright PNG. It requires exact decoded RGBA equality. Follow with
GPU/video/art cases, the color chart, exporter recovery and complete-export measurements before
considering promotion. A transport microbenchmark alone cannot establish an export improvement.

JPEG passes all 192 theme/aspect/ordered/shuffled samples with exact decoded RGBA equality,
and the encoded color chart passes the existing metadata and browser-playback limits. PNG also passes all 192 independent-page samples exactly and the encoded color chart
metadata/playback checks. Each mode also passes 48 GPU/video samples (field, tunnel, constellation and looping video
in both orientations), for 240 exact samples per mode. Both modes pass exporter acceptance, including failures/cancellation, and scheduling acceptance
with exact cached and resumed video/audio. Ready passes 665 tests in 110 files, lint/types/formatting,
isolation and decoded smoke. This older comparison base has fewer tests than current main.
The subsequent standard-workload timing below rejects promotion. The candidate starts at comparison runtime 6c373c0 so current-upstream
comparison dependencies remain isolated from production.


## Complete-export timing and decision

The isolated candidate f5d06b5 completes three alternating pairs for each mode against the
Playwright screenshot control. Both use four automatic workers and the frozen standard fixture,
90–100 seconds, 1080p30, JPEG 95 / CRF 18. Every arm passes the 15% pre-run CPU limit; no own
validation runs concurrently. Clean revisions, input identities, actual runtime, decoded output,
CPU observations and memory are retained in `timing/`.

| Experiment | Control median (range), seconds | Candidate median (range), seconds |
| --- | --- | --- |
| Direct CDP JPEG | 6.892 (6.850–6.981) | 7.117 (6.958–7.164) |
| Fast CDP PNG | 7.054 (6.728–7.282) | 21.545 (21.498–21.663) |

Direct JPEG has no observed benefit; its median is 3.3% higher and its spread overlaps the control.
All six JPEG-pair decoded hashes are identical. Fast PNG takes 3.05 times the control wall time.
PNG changes the input compression and color conversion path, so this is not a matched-quality
PNG/JPEG claim. Its source/color correctness checks pass, but the measured complete export is not
a faster replacement. No production mode or dependency changes follow.

This timing conclusion covers the standard workload only. GPU/video source checks remain valid,
but their throughput was not measured after the standard regression. A transport must improve
the intended workload suite before promotion; a successful pixel probe alone is insufficient.
The earlier partial timing series and its busy-host failure are retained with `preliminary-`
prefixes. No failed output was overwritten or omitted from the evidence.

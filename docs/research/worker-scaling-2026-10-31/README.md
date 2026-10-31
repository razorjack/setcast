# Worker scaling with corrected paint, 31 October 2026

The [paint correction](../paint-history-2026-10-31/README.md) passes repeated theme and worker
qualification. The automatic policy remains a candidate until its new complete-export timings
are checked. The 29 October measurements did not include this paint reset and cannot qualify it.

`automatic-policy.patch` retains the CPU/memory selection candidate. It chooses one worker below
300 frames, otherwise 1/2/4 within half the available CPU count and a quarter of stable memory,
using a 512 MiB shared reservation plus 512 MiB and 48 bytes per output pixel per worker. These
are estimates, not enforced native/GPU memory limits. Explicit 1–8 selection overrides them.
Selection happens before identity, and runtime callbacks report the decision. Add `scheduling.ts`
to the browser bench tsconfig when applying the patch. The updated acceptance fixture uses the
exact deterministic marker scene, keeping theme paint comparisons separate.

The candidate passed automatic four-worker selection, repeated cache reuse, equivalent explicit
count reuse, cancellation and exact video/audio checkpoint recovery. See
[`scheduling.json`](../paint-history-2026-10-31/scheduling.json).

The first timing attempt made no exports because all twelve five-second pre-run system CPU
samples exceeded 15%. Its empty failed report and log are `busy-standard.json` and
`busy-standard.txt`. A second attempt is retained separately if it also fails the quiet check.
No timing claim is made from these attempts. Other projects and macOS services are left running.

The pending comparison uses three alternating one/automatic repetitions on the unchanged standard,
GPU tunnel and looping-video fixtures from the previous study, each 10 seconds at 1080p30.
Record actual background CPU during each arm, complete decoded hashes, dimensions/frame counts,
encoded bytes and process-tree RSS. The latter can double-count shared pages. Run timing separately
from correctness workloads and retain rejected attempts.

# Contiguous chunk workers, 1 November 2026

The bench-only experiment compares four pages sharing each sequential chunk through the current
round-robin frame pipeline against four independent page/encoder workers. Both arms use the
same absolute frames, three-second chunk boundaries, JPEG 95 / CRF 18 and one continuous master
soundtrack. Each worker owns at most one active encoder and the existing bounded frame pipeline;
final chunks are muxed in timeline order. Production scheduling is unchanged.

The initial 360-frame looping-video pilot passes exact decoded video and audio equality. It ran
alongside other correctness/resource work, so its wall times are not speed evidence. Three
alternating quiet pairs on each predefined standard/GPU/video workload remain required before
making a scheduling recommendation. Cancellation and resume of a production chunk-worker
implementation would require separate integration tests; this harness does not claim them.

```sh
node packages/renderer-browser/bench/chunk-scheduling.ts FROZEN_PROJECT --out NEW_DIRECTORY --repeat 3 --idle-busy .15
```

The common benchmark boundary includes preflight, a fresh render session, audio encoding, frame
capture, video encoding, assembly and cleanup. Project preparation and decoded verification are
outside it. Four pages are used in both arms. The report retains input identity, encoding,
resource observations and exact output comparison. This isolates scheduling, not a comparison
with Remotion or an already qualified production fast path.

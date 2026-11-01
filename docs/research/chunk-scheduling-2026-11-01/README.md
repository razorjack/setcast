# Contiguous chunk workers, 1 November 2026

The bench-only experiment compares four pages sharing each sequential chunk through the current
round-robin frame pipeline against four independent page/encoder workers. Both arms use the
same absolute frames, three-second chunk boundaries, JPEG 95 / CRF 18 and one continuous master
soundtrack. Each worker owns at most one active encoder and the existing bounded frame pipeline;
final chunks are muxed in timeline order. Production scheduling is unchanged.

The initial 360-frame looping-video pilot passes exact decoded video and audio equality. It ran
alongside other correctness/resource work, so its wall times are not speed evidence. The subsequent quiet comparison below completes three alternating pairs on standard/GPU/video
fixtures. Cancellation and resume of a production chunk-worker
implementation would require separate integration tests; this harness does not claim them.

```sh
node packages/renderer-browser/bench/chunk-scheduling.ts FROZEN_PROJECT --out NEW_DIRECTORY --repeat 3 --idle-busy .15
```

The common benchmark boundary includes preflight, a fresh render session, audio encoding, frame
capture, video encoding, assembly and cleanup. Project preparation and decoded verification are
outside it. Four pages are used in both arms. The report retains input identity, encoding,
resource observations and exact output comparison. This isolates scheduling, not a comparison
with Remotion or an already qualified production fast path.


## Quiet comparison and decision

Main a00ece3 completes three alternating pairs per frozen standard, Tunnel and looping-video
fixture, after bitmap video preparation was promoted. The research range is 90–102 seconds with
four three-second chunks in both arms, not the separate current-upstream ten-second suite. Every
arm passes the 15% pre-run CPU limit without another own validation job. All eighteen outputs
match their corresponding fixture's decoded video and audio exactly.

| Fixture | Round-robin median (range), seconds | Chunk-worker median (range), seconds | Peak summed RSS, round-robin / chunks |
| --- | --- | --- | --- |
| Standard | 9.518 (9.372–9.584) | 9.438 (9.417–9.451) | 3.018 / 5.066 GB |
| Tunnel | 10.730 (10.622–10.904) | 10.502 (9.960–10.741) | 2.875 / 4.910 GB |
| Looping video | 17.729 (17.537–17.833) | 16.820 (16.108–17.074) | 4.214 / 6.223 GB |

The median reductions are 0.8%, 2.1% and 5.1%. The first two timing ranges overlap. The video
result improves modestly, but every fixture adds about 2 GB of sampled summed RSS. This measure
can double-count shared pages and excludes external GPU services; it is not physical RAM usage.

Keep the current production scheduler. These gains do not justify the additional encoders,
resource policy, ordered cache/checkpoint publication and recovery work for this milestone.
A future long-master study with the actual default chunk duration could reach a different
conclusion; this short four-chunk study does not qualify that workload. It also does not justify
changing chunk boundaries or the current-Remotion speed objective. The experiment and complete
reports remain available without adding a production scheduling option.

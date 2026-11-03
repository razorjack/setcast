# Linux live qualification

The final candidate `166e51d` passes all additional local live CI checks and the unchanged
one-hour recovery preset. The unchanged 90-minute software preset fails with dropped analysis
samples, including an isolated repeat. No failed, cancelled or shortened run qualifies that preset.
All inputs are synthetic. These results do not qualify physical mixers, MIDI devices, OBS,
camera capture or display latency.

## Passing checks

The [executed-check index](candidate-ci-result.json) records producing revisions. The final
candidate passes output recovery, bounded transport, sequence/replay, projection, energy selection,
beat tracking, branding, camera patterns and MIDI. The sequence harness originally failed twice;
pre-click DOM diagnostics showed Run/Next enabled during a manual fade while scene pads were
correctly disabled. Fix `97f2db7` makes sequence controls respect the same transition restriction.
The unchanged sequence harness passes three times on the final candidate, including malformed-art
failure, journal and restart assertions. Original failures and diagnostic launcher errors remain
retained. The original harness removed its temporary fixture on failure; instrumented reproductions
retain fixture copies, DOM snapshots and screenshots.

The [one-hour recovery report](final-live-gpu-recovery-isolated.json) records:

- 3,600.10 seconds of workload, 710 samples, 119 forced WebGL recoveries, 79 scene changes,
  three capture restarts and four ended, validated journals.
- Zero dropped samples in every observation, at most 2,048 cached features and 414–419 DOM nodes.
- Chromium 156.0.8078.4 with observed SwiftShader. Configured output is 1920×1080; the browser
  viewport is 1440×1000 with a scaled preview. Controls remain in the output window.
- Rendered-update FPS has median 30.0 and range 6.4–31.7. The harness does not assert a universal
  FPS threshold. Context recovery is synthetic and does not establish hardware-driver reset behavior.

Quarter-hour JavaScript heap medians are 60.89, 57.96, 60.28 and 58.13 MB. Runner RSS medians
are 703.61, 702.97, 705.48 and 707.72 MB. Heap peaks reach 124.60 MB before returning lower;
there is no monotonic increase across these interval medians. These observations exclude browser
native allocations and GPU memory. See [all intervals and original statuses](live-summary.json).
The final screenshot was inspected and remains in the raw evidence directory.

## Failed software endurance

The software preset explicitly uses SwiftShader, one visualizer at resolution 0.25, a separate
operator window, one-minute scene changes and 15-minute capture restarts. Its full requested
duration remains 5,400 seconds.

| Attempt | Result | Evidence |
| --- | --- | --- |
| Concurrent startup with recovery preset | Failed at 11.47 s with 4,096 dropped samples | [Report](final-live-software.json) |
| Isolated full-preset repeat | Failed at 604.81 s after ten scene changes with 17,408 dropped samples | [Report](final-live-software-isolated.json) |
| Accelerated transition diagnostic | Failed after four changes with 19,456 dropped samples | [Report](final-live-stall-diagnostic.json), [observations](live-stall-summary.json) |
| Packet-delivery diagnostic | Failed after four changes with 17,408 dropped samples | [Report](final-live-packet-diagnostic.json), [observations](live-packet-summary.json) |

The first recovery attempt was cancelled through SIGINT after 87 seconds to isolate the software
failure. Its cancelled status and exit 130 are retained. The later full recovery pass supersedes
that incomplete recovery attempt, not either software failure.

The packet diagnostic observes an 874.8 ms gap between main-thread packet receipts. At 48 kHz,
the existing queue allows 24 packets of 1,024 samples, or 512 ms. The excess is approximately
the observed 17,408 dropped samples. This supports queue overflow from delayed delivery; it does
not identify the browser operation causing the delay. The largest recorded long task is 151 ms.
Attempted extra worklet metadata was absent, so producer-side pending/frame measurements are
unavailable. Instrumentation overhead and accelerated scene changes limit diagnostic interpretation.

No safe production repair for the delivery gap has been established. Queue bounds and zero-drop
assertions are unchanged. Further work needs browser scheduling/rendering profiling around the
Constellation-to-Field transition, followed by an unchanged full-preset rerun. The passing recovery
preset differs in scene composition, resolution and operator placement, so it cannot isolate any
one of those factors by itself. This live limitation is separate from offline renderer correctness
and the failed first-export performance target.

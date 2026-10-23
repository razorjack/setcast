# Exact-output spectrum optimization

Live software-rendering profiles on 2026-10-23 showed substantial routine CPU time in FFT input
copying and adjacent-bin smoothing. The shared core spectrum implementation now uses indexed
loops for copying, magnitudes and smoothing. The three smoothing passes alternate two arrays
owned by the current call, reducing their allocation count without sharing mutable scratch state
across frames. The existing cached FFT coefficients and transform operations are unchanged.

This preserves sample lookup, zero padding, floating-point operation order, edge bins, three-pass
smoothing and independently owned result arrays. It changes neither the audio-feature contract
nor configuration. Both exporters and live analysis use the same implementation.

## Reproduce the comparison

```sh
node packages/renderer-browser/bench/spectrum.ts --reference ff76fe1 --out /tmp/spectrum-comparison.json
```

Run from the repository root with pinned Playwright Chromium installed. The command loads the
reference source from the resolved Git commit and the current source from the working tree.
It type-strips both and runs the same comparison in Node and Chromium. It checks exact equality
for 256 windows, including padded boundaries, warms each implementation with 4000 transforms,
then alternates their order across six measurements of 4000 transforms. The output records the
reference commit, current source hash, runtimes, CPU, timings and checksums. Existing output
files are rejected. This is repository tooling, not a runtime benchmark inside the player.

On Apple M1 Pro, Node 26.7.0 and Chromium 156.0.8078.4, with no concurrent development checks:

| Runtime | Reference median | Indexed-loop median | Time reduction |
| --- | ---: | ---: | ---: |
| Node | 1075.74 ms | 217.82 ms | 79.8% |
| Chromium | 1014.05 ms | 218.50 ms | 78.5% |

[Raw measurements](benchmarks/spectrum-loops-2026-10-23.json) retain every repetition. These are
kernel timings on one machine, not a claim of equivalent live FPS or export speedup. Screenshot
capture, compositor work, asset readiness and encoding remain separate costs. In particular,
this result does not explain or qualify the intermittent long SwiftShader stalls documented in
[software qualification](software-qualification-plan.md).

Validation passed: exact comparison in both runtimes, input/result ownership across out-of-order
queries, ready with 571 tests, both exporter acceptance suites, and all GPU visualizer/live checks.
The real-master frame at 15:30 retains decoded-pixel MD5 `96a12d9d5f875e7163dcd96c1e5831c8`.
These checks establish the tested numerical and rendering behavior; sustained software overload
remains a separate unresolved qualification issue.

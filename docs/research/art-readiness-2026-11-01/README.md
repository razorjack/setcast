# Hold readiness through the React commit

Current Remotion 4.0.539 repeatedly captured a black frame at the portrait corpus art change
at 105 seconds. The first ten-second output and all three independent two-second repeats
contain the failure. The corresponding browser outputs have content. This is a shared
readiness-contract defect exposed by the faster capture path, not a compression artifact.

`useHoldUntil` starts its loader hold in a passive effect and releases that hold when the
promise settles. Its consumers can still render pending state until React commits the matching
ready state. Prepared art returns null during that state, and Stage intentionally stays hidden
to prevent incorrect early text paint. Promise completion alone therefore cannot establish
that the captured DOM is ready.

The correction adds a layout-effect hold whenever label, revision or ready state does not
match the current request. It releases only when ready state has committed, covering both the
initial pending commit and the interval after asynchronous completion. Existing cancellation,
error propagation and stale-result checks remain in place. No adapter-specific delay is added.

Three controlled repeats with this correction contain no black frame in either adapter.
`original.json`, `commit-hold.json` and `black-frame-check.json` retain all runs and the frame
scan. Original comparison PNGs show the content difference. Timing was under shared load and
is not performance evidence. The temporary upstream-checkout change was restored after testing.

The exporter acceptance suite also checks every decoded frame in a 30-frame red-to-blue
prepared-art transition at portrait resolution. The simpler synthetic original-code control
passes too, so it checks the general transition contract but does not reproduce the full
Afterhours failure. Keep the frozen portrait workload as the actual reproducer; do not present
the synthetic test as a failing-before regression. Both acceptance suites and same-page driver
checks must pass before retaining the shared-hook change.

Reproduction uses `scripts/render-compare.ts` in the isolated current-upstream checkout with
the frozen `portrait` project, `--at 104 --seconds 2 --repeat 3 --concurrency 1`, browser JPEG100
and CRF16. Run FFmpeg `blackframe=amount=99:threshold=20` on each output; the original failure
is offset30 in those slices, absolute frame3150. Retain fresh output directories for every run.

Browser video hashes are identical across all six original/corrected repeats:
`bba3e0e852e0f3b48a2c899d9e4e14cf41420455f7b11063caf5254fd9fe4fc5`.
Both exporter acceptance suites pass, including missing assets, cancellation and recovery;
the same-page scene/font/backward-seek/video-loop checks pass too.

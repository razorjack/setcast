# Decoded export qualification plan

The sustained exporter currently checks container metadata. The full-master session added manual
decoded frame counting and sampled audio alignment. Make those checks reproducible for another
project or machine without changing rendering behavior.

- Extend version 1 export workloads with `verification: metadata | decoded` (default metadata).
  Decoded mode reads every video frame and compares bounded stereo PCM windows against the
  source master at the rounded render-range origin. Keep memory independent of set duration.
- Add `--verify-video FILE` to the endurance runner for an existing export. Require export mode
  and retain the new-output-directory rule. Do not render or modify either input. Record that
  runtime/revision describe the verifier, not the original producing renderer.
- Decode failures, wrong dimensions/rate/count/duration, missing audio, poor correlation or
  excessive audio offset fail explicitly. Silence or ambiguous periodic audio is inconclusive,
  never evidence of alignment. Record results before reporting failure.
- Use asynchronous FFmpeg/ffprobe subprocesses with cancellation and bounded output. Preserve
  the output report on interruption. Record verification time separately from rendering time.
- Test the alignment math with known shifts, channel swaps, silence and periodic ambiguity.
  Exercise real encoded positive/shifted/truncated fixtures and the existing 56-minute export.
  Document limits: sampled audio does not prove every sample, decoded frame count does not prove
  scene pixels, and forced/local runs do not qualify other drivers or physical equipment.

Started around 16:35 Warsaw. Two-hour GPU recovery continues independently until about 17:35.

## Completed implementation

The reusable verifier is implemented. It records media hashes, decoder versions, rounded range
origin, per-channel alignment evidence and separate verification time. Optional audioAt selects
explicit output-relative windows; defaults sample six locations. Media identity is rechecked before
acceptance. Existing-video checks never claim the verifier revision produced the video.

Ready passed all 555 tests. The Chromium/FFmpeg regression passed a real browser export, rounded
range origin, selected checkpoints and rejection of 20 ms delay, silent output, truncation and
out-of-range checkpoints. SIGTERM during full video decoding produced a cancelled report and
clean exit. The first full-master check decoded all 101160 frames, passed five musical windows
with zero lag, and correctly rejected its sixth window as inconclusive because it landed in the
silent tail. A rerun with the six previously inspected musical passages is in progress.

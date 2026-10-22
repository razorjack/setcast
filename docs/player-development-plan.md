# Player development plan

Status: implemented and regression checks passed, 2026-10-22 on master. Remotion remains the default exporter.
This file records scope, decisions, verification and the next step for unattended work.

## Scope and order

1. Establish baseline checks and add live diagnostics suitable for a sustained session.
   Exercise bounded analysis with synthetic input; record precisely what was tested.
   Physical mixer/interface, OBS and end-to-end latency qualification require actual hardware
   and remain explicitly unqualified unless measured.
2. Save the recorded player's selected scene and live settings explicitly. Preserve source
   configuration, persist uploaded artwork inside the project, and make saved configurations
   usable by the CLI. Validate requests, paths, asset types and same-origin writes.
3. Add an operator window controlling the existing output session. One window owns capture
   and time. Opening controls must never acquire another device. Report lost connection.
4. Add a versioned session journal with sample-clock timestamps, manual credits/cues and
   scene changes. Reconnects start separate sessions. Convert a journal plus a recorded master
   and explicit clock offset to a finite recorded project. Preserve durable asset references;
   reject unsupported or invalid replay instead of silently discarding events.
5. Support manual live tempo and inspect live theme behavior. Do not invent finite progress.
6. Run browser checks, baseline checks and package smoke; update user documentation.

## UI direction

Visual thesis: the theme and art remain the full-canvas workspace; operator tools use the
existing quiet dark dock with clear labels and one action accent.
Content plan: output canvas, dock actions, focused settings, diagnostics and session tools.
Interaction thesis: preserve dock reveal and native popovers; acknowledge saves inline;
prepare scene changes behind the existing ready scene. No ornamental animation.

## Constraints

- Preserve finite recorded timelines and open-ended live projects as separate types.
- Audio capture must not wait for fonts, images, theme changes or operator connection.
- Visual delay does not change journal timestamps or the recorded-master clock mapping.
- No hardware protocol integration, native capture, streaming credentials or publishing.
- Keep changes local; no GitHub publication was requested.
- Use the existing style and shared core contracts. Avoid a general remote-control framework.

## Progress and evidence

- Read the current player, capture, PCM, export and readiness implementations.
- Starting revision: 7ce42cc, clean master working tree.
- Completed safe explicit saves, diagnostics, operator controls, manual tempo and journal replay.

## Remaining hardware qualification

Run one to two hours with the intended mixer/interface and OBS window capture. Record device,
sample rate, exposed channels, browser, resolution, theme, dropped samples, rendered FPS,
memory trend, measured A/V offset, disconnect/reconnect and repeated scene changes.
Synthetic checks are not evidence of physical latency or OBS reliability.

### Checkpoint: player implementation

- Baseline: 416 tests passed; after save/journal changes, 420 tests passed.
- Added explicit Save scene, self-contained copies, same-origin POST checks and media containment.
- Added operator controls via a React portal into a popup; capture and journal remain owned by
  the output window. Closing controls restores them in the output window.
- Added manual BPM, tap tempo/downbeat, bounded downloadable diagnostics, durable JSONL journal,
  manual metadata events, saved scene changes, and `setcast replay` with explicit master offset.
- Replay currently rejects nondefault capture gain/delay; it restores metadata and scene changes,
  not audio capture. Physical mixer capture remains unqualified.
- 30-second synthetic Chromium check passed: all 16 theme selections, capture stayed running,
  operator transfer/return, credit/cue logging and 20 ordered journal events including end.
- Collaborative browser snapshot timed out twice; switched to pinned Playwright for checks.

### Checkpoint: regression and packaging

- Replay integration tests now exercise a real recorded master, explicit offset, tempo phase,
  independent copied presets, source preservation and recursive-copy rejection.
- HTTP tests check exact-origin/custom-header writes, invalid art, escaped paths and read-only
  export servers. Journal tests check concurrent append ordering, end markers and symlinks.
- A newer 120-second synthetic run passed all 16 themes and operator/journal continuity with
  zero skipped analysis samples. PCM capacity stayed 485100 samples at 44.1 kHz; sampled feature
  cache peaked at 1708 entries (limit 2048). Sampled JS heap peaked near 65 MB and ended near
  45 MB; this short run does not establish a long-term memory trend.
- Inspected output and operator screenshots; corrected the OBS instruction to name the output
  window and replaced the redundant popup action with Return controls to output.
- Both exporter acceptance runs pass, including cancellation. Packed CLI browser PNG/video,
  default video, all built-in themes, and player servers pass `package-smoke --browser`.
- `vp run ready` passed with 427 tests in 65 files, dependency bans and the default export smoke.
- Recorded-player UI check passed play/pause/seek, theme selection, uploaded SVG art, tracklist,
  persisted save confirmation, self-contained reload and finite playback end. Screenshot inspected.
- Final operator check passed Return controls to output, journal continuity, stop-induced end
  marker and capture restart at frame zero. Final popup screenshot inspected.
- The final 30-second check also passed manual BPM, tap tempo, downbeat, all 16 themes and
  capture restart. It recorded 20 journal events and no skipped analysis samples.
- Final `vp run ready` passed after the tempo and CLI fixes. An earlier run, concurrent with
  packaging and both export suites, timed out the existing dense-cache test; isolated reruns
  passed without code or timeout changes.
- The one-hour synthetic run completed on Chromium 156.0.8078.4 at 960×540/30 fps. All 3574
  sampled capture states were running, PCM capacity stayed at 485100 samples, and the feature
  cache peaked at 1707 entries. It recorded 20 journal events and no browser errors. One
  1024-sample analysis packet was skipped near eight seconds during concurrent work, about
  23 ms at 44.1 kHz; the count did not increase afterward. Results are in
  `examples/demo/out/player-endurance/result.json` (generated, ignored).
- That endurance run used the implementation before the final UI polish. Capture code was
  unchanged; the final shorter run covers the updated controls. Browser heap measurements
  were unavailable in the endurance run, so it establishes bounded analysis storage, not a
  total-process memory guarantee. Physical mixer and OBS checks remain the next qualification.

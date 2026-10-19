# Browser playback prototype

The first target is real-time playback of a finalized Setcast project: recorded audio,
artwork, theme, overrides, credits, annotations and visualizers. Live audio inputs,
hardware events and direct streaming to a platform are separate work.

## Test plan

Establish the regression suite before extracting shared rendering code. The baseline is
324 passing tests in 44 files. Preserve behavioral assertions instead of JSX snapshots.

### Before refactoring

- Pin the PCM analysis with deterministic tones, impulses and stereo fixtures. Check FFT
  amplitude and frequency, antiphase energy, mono equivalence, overlapping decoded windows,
  absolute offsets, source padding, query order, FPS independence and history/lookahead.
- Exercise `FrameProvider` and hooks with supplied frames, missing-provider errors and
  historical audio requests, including silence before zero. Test frame assembly when it
  becomes a shared function.
- Cover asset-hold success, synchronous failure, late rejection, independent cancellation
  and exactly-once release. Cover prepared-resource sharing, retention, eviction and retry.
- Validate invalid history requests and the fractional-frame/microsecond end boundary.
- Strengthen the export smoke check with actual stream metadata, duration/frame count and
  decoded non-silent audio when the relevant external tools are installed.

One GPT Sol 6.1 high subagent implements this stage. Small defects exposed by the tests
receive their own fixes and regression tests. The parent reviews the changes and runs
`vp run ready` before committing.

### Shared-code extraction

- Both adapters use the same frame assembly, timeline queries and modulation calculation.
  Assert fixed fixture outputs, random query order, analyzer identity, dimensions and
  display-clock independence.
- Move PCM/FFT calculations behind Setcast-owned types without changing calculations.
  Keep the Remotion audio-window translation small; run its characterization tests against
  the translated inputs.
- Preserve `framesWithinMix` behavior at fractional final frames. Playback end handling
  must never query the exclusive end of the mix.

### Playback implementation

- Test audio-clock sampling, pause/resume, seeking, skipped frames, buffering, end/replay
  and stale asynchronous completion independently of animation callback frequency.
- Test bounded decoded-window retention, prefetch, rapid seek replacement, analysis at
  window boundaries and disposal. Seeking must supply the destination's history.
- Test local asset serving, range requests, invalid paths and server cleanup.
- In a real browser, exercise the actual scene with audio, image and video assets. Check
  play/pause/seek, frame-to-audio alignment, history-driven visualizers, delayed readiness,
  error reporting and clean/fullscreen output. Inspect representative theme screenshots.
- Run a sustained playback sample and record its duration, stalls and bounded resource
  observations. Do not describe a short sample as a full-hour or OBS qualification.
- Run the existing offline checks after shared-code changes. Package layout changes also
  require `vp run package-smoke`.

## Prototype direction

Use a browser adapter that supplies `RendererBindings` and `RenderFrame` to the existing
`Stage`. Audio playback supplies time; visual frames may be skipped without slowing audio.
Analysis uses bounded decoded PCM windows and the same calculations as offline rendering.
The initial target is a current Chromium browser on localhost.

The visual design keeps the selected theme and artwork as the full-canvas workspace.
A compact transport bar supplies playback, seeking, volume and fullscreen. Scene motion
continues to come from Setcast time; control feedback is brief and respects reduced motion.

Do not change the finite mix model to represent an unfinished performance. Do not add
Twitch credentials, publishing or a second independent audio player for a control view.

## Verification record

The pre-refactor suite passes 353 tests in 46 files (29 new tests). `vp run ready`
passes check, tests, the Remotion dependency ban and the strengthened export smoke.
The smoke confirms 90 H.264 frames at 30 fps, AAC audio, a three-second video and
decoded audio RMS 0.4572. Audio/container duration tolerates 0.1 s of AAC tail;
this checks completeness, not synchronization.

The tests exposed two small defects: invalid history requests were not rejected, and
a prepared-resource release called twice could decrement another consumer's reference.
Both have regression tests and separate fixes. SSR context tests do not exercise mounted
browser effects. Frame construction, transport and browser integration remain the next stage.

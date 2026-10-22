# Browser playback prototype

The first target is real-time playback of a finalized Setcast project: recorded audio,
artwork, theme, overrides, credits, annotations and visualizers. Live audio inputs are now a separate `setcast live` mode, documented in [live audio input](live-input.md).
Hardware events and direct streaming to a platform remain separate work.

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
browser effects; those require the browser checks below.

Shared PCM analysis, FFT, frame assembly and finite frame counts now live in core.
The extraction passes 356 tests in 47 files and `vp run ready`. The demo still at 33 s
is byte-identical before and after the extraction. This verifies one offline reference,
not all themes or continuous playback.

## Running the prototype

From the checkout:

```sh
node packages/cli/bin/setcast.js play examples/demo
node packages/cli/bin/setcast.js play path/to/project --theme darkroom --port 3211
```

From an installed CLI, use `setcast play path/to/project`. Open the printed URL in current
Chrome. The dock has play/pause, a chapter scrubber with the mix's drops, volume and full
screen. It also switches among the built-in themes, credits with panels, the tracklist or both,
and replaces the art with a chosen or dropped image or video for the whole set. None of these
write to the source configuration. **Save scene** writes a separate `saved-scene-*` project
with the selected theme, credits, artwork and copied media. Open that directory with `setcast
play` or `setcast render`. Source files remain unchanged. `H` hides the dock, which then returns while the pointer touches the
bottom edge, and `?` lists every shortcut.
Restart the command after editing the project. Ctrl+C closes the server.

`@setcast/renderer-browser` supplies the existing `Stage` with `RendererBindings` and the
shared `resolveFrame`. HTML audio supplies time; visual frames are quantized to project FPS.
Mediabunny decodes bounded PCM windows for the shared analyzer, including historical audio
and FFT lookahead. Ten-second windows prefetch five seconds ahead. The cache retains two
windows and serializes decoders, cancelling obsolete seek requests. This avoids retaining
the full decoded set. The decoder's byte cache is separately limited to 16 MiB.

Images and fonts use the existing readiness contract. A hold pauses audio and resumes only
if the user still wants playback. Seeking to an uncached region also pauses for preparation.
Native video follows the master clock, correcting drift above 120 ms while running and
seeking on paused frames. Video background timing is approximate. All browser audio is
mono or stereo; unsupported codecs produce an actionable error.

The new package does not depend on Remotion. The CLI uses the shared duration probe from
core/node while loading a project. No finite timeline or theme model was changed.

## Playback checks

The completed prototype passes 372 tests in 51 files, up from 324 tests in 44 files.
`vp run ready` passes formatting, lint, types, tests, the dependency ban and the offline
render smoke. `vp run package-smoke` passes against all five packed packages.

Automated coverage includes transport intent, readiness holds, dropped callbacks, seeks,
end/replay, native codec duration clamping, stale play completion, decode failures,
serial decoding, cancellation, cache eviction after backward seeks, bounded retention,
PCM packet placement, byte ranges, path containment, HTTP responses and server cleanup.
The retention test visits 360 synthetic windows; it is not an hour-long browser run.

The real-browser checks use the generated demo and a temporary MP3 conversion with a
four-second H.264 background, the darkroom spectrogram and a project CSS override:

- The WAV demo ran from start to its 154.48 s endpoint. A 250 ms sampler observed 610
  playing samples, no preparation status during that interval, and at most two windows.
  The sampled audio advance differed from elapsed wall time by about 10 ms over 152 s.
  That measures sustained clock progression, not audible or physical display latency.
- Forward, backward and rapid replacement seeks exercised annotation boundaries and
  ten-second analysis boundaries. Paused time remained fixed. At one playing sample,
  the rendered frame trailed the native audio clock by 27 ms at 30 fps.
- MP3 playback and seeking rendered the history-based spectrogram. A paused seek to
  110.3 s placed the looping four-second background at 2.3 s. Uncached MP3 preparation
  took seconds on this machine. Fullscreen and hiding/restoring controls were exercised.
- Replay after an explicit end seek works even when MP3 decoding clamps the native clock
  slightly before the probed duration. CSS overrides were checked on the rendered header.
  A missing audio request stops playback and shows a reloadable error.
- The packed-package smoke bundles and serves the browser player without workspace
  sources, and checks partial audio responses. The dependency ban includes the new package.

This is a playback prototype, not an OBS or Twitch qualification. Recorded playback has no hardware events, stream encoder, event log, remote control, automatic
start or project watcher. Live input is available separately through `setcast live`. There is no full-hour endurance result, cross-browser qualification or exhaustive
visual parity comparison. Native compressed-audio clocks can differ slightly from the
loader's probed duration because of codec padding. Background tabs can throttle visual
callbacks. Smooth, uninterrupted broadcasting and frame-exact video synchronization remain
separate work.


## Follow-up work

Saved scenes, live operator controls, diagnostics, manual tempo and journal replay are tracked
in [player-development-plan.md](player-development-plan.md). The selectable offline exporter
has its own [guide](browser-renderer.md) and [implementation plan](independent-renderer-plan.md).
Remotion remains the default for offline output.

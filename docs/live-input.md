# Live audio input

`setcast live` turns an audio input into a themed visual scene. It needs no recording,
track identities or known duration. Use it for an OBS window capture, a screen behind the
DJ, or a projector.

```sh
setcast live --theme relief
setcast live path/to/live-project --port 3210
```

From the checkout:

```sh
node packages/cli/bin/setcast.js live examples/live
```

Open the printed localhost URL in current Chrome. Choose the audio interface and click
**Start input**. The browser calls its permission “microphone” access even when the source
is a line input on an interface. After capture starts, select the exposed left and right
channels. Select the same channel for both sides to visualize mono.

Each exposed channel has a peak meter. Red indicates a peak near digital full scale.
**Sensitivity** changes the signal used for visualization; it does not change the mixer
or OBS level. **Visual delay** adds up to two seconds of delay to align visuals with a
delayed camera or streaming audio path. It cannot make visuals precede captured audio.

Capture does not play through the computer's speakers. For streaming, add the mixer audio
to OBS separately and capture this browser window for video. Setcast does not encode or
publish the stream. Direct device capture inside an OBS browser source is not qualified.

**H** toggles clean output, hiding every control and notice. **F** toggles fullscreen.
**Esc** leaves fullscreen while keeping the output clean; **H** explicitly reveals controls.
**[** and **]** switch themes. There is one capture owner in this window; the **Operator window**
button moves controls into a separate window and hides them in the output. Capture the original
output window in OBS. **Return controls to output** reveals the controls there. Closing the
operator window unexpectedly keeps output clean; press **H** to recover its controls.
Opening another localhost player tab starts an independent session. Closing the output window
ends capture and closes its operator.

## Output setup and recovery

Open **Output setup** in the operator window. **Find displays** requests window-management
permission on supporting Chromium browsers. Select a display, then **Restore fullscreen**.
If permission or cross-window fullscreen activation is refused, move the output window manually,
focus it and press **F**. Fullscreen exit and display disconnection produce operator notices;
Setcast does not repeatedly request fullscreen without a user gesture. Display selection is
session-only and resets to the current display when the selected screen disappears or changes.

**On input loss** defaults to **Black output**, including before input starts. **Quiet scene**
keeps the scene with silent audio features. Temporary track muting clears stale audio history;
output resumes only after fresh packets arrive. A disconnected input, an interrupted audio
context or 1.5 seconds without analysis packets stops capture with a private diagnostic and
requires **Start input** again. Ordinary silence from a connected mixer is valid input and
never triggers this fallback. A stopped capture retains its last visual time.

**Adaptive GPU resolution** defaults on. After three slow diagnostics samples (below 80% of
target FPS), the `field` drawing-buffer scale halves, down to 25% of the scene setting.
Fifteen healthy samples (at least 95% of target) raise it one step. Hidden output and unavailable
input do not lower quality. Disabling adaptation restores the configured resolution. This adjusts
only the live GPU field; other visualizers, capture timing, scene settings and offline exports
are unchanged. Fallback and quality settings apply to this browser session and are not journal
performance events. Replay uses the separately recorded master and full configured resolution.

Run `node packages/renderer-browser/bench/output.ts` to check synthetic mute/recovery, stalled
packets/restart, fullscreen exit, display denial/disconnection, private notices and adaptive
resolution while capture advances. Display inventory and overload are simulated; actual
multi-display routing, unplugged interfaces and projector hardware still require qualification.

## Configuration

`live.yaml` is optional. Without it, the current directory is the asset root and Setcast
uses the default theme, no artwork, no title and no clock. Live mode does not read
`setcast.yaml`, so a live session can share a directory with a recorded project without
loading or decoding that recording.

```yaml
title: Vinyl room
theme: relief
background: assets/art.jpg
backgroundFit: auto
clock: false
# Optional manual tempo, with a downbeat at this capture time.
# bpm: 174
# beatOffset: 0
output: {width: 1920, height: 1080, fps: 30}

input:
  # Optional exact device name or browser device ID.
  # device: My Audio Interface
  # Optional exposed channel numbers, starting at 1. Omit for mono/stereo auto selection.
  # channels: [3, 4]
  gain: 1
  delay: 0

# Optional: the same visualizer and audio modulation settings as recorded projects.
# visualizer: {name: ridgeline, seconds: 4}
# css: overrides.css
# modulation:
#   - {source: bass, target: bg-zoom, range: [1, 1.06], smooth: 0.1}
```

Live configuration covers appearance, branding, input, manual tempo, performance defaults, scene
progression, assisted beat tracking, projector setup, camera patterns and MIDI assignments.
`setcast schema live` prints the complete installed authoring contract; see
[configuration-schemas.md](configuration-schemas.md) for editor setup and validation.
Live `output` accepts only `width`,
`height` and `fps`; it has no encoding settings or output file. Asset paths must stay
inside the project directory. Restart the command after editing the YAML or CSS.

The dock can change the theme, title, elapsed clock, artwork, channels, sensitivity and
delay. Artwork can also be dropped onto the player. **Save scene** writes a new
`saved-scene-*` directory containing live.yaml, the resolved theme CSS and copies of the
chosen assets. It leaves the source configuration unchanged. Open that directory with
`setcast live` to restore it. While a journal is active, changes also save scene snapshots.
`clock: true` shows elapsed session time with no endpoint. There are never track panels,
a tracklist or upcoming-track text. Starting input again begins a new session at zero.

## Input routing and limitations

Selecting an interface does not guarantee access to all of its physical inputs. Setcast
shows the channels actually delivered to its audio worklet. Browser, operating system and
driver behavior can restrict or mix those channels before Setcast receives them.
`channelCount` is requested at up to 32 channels; it is not a physical-port selector.

If inputs 3–4 are missing, route the mix to an exposed stereo input using the interface's
routing software, or choose another browser-visible input device. A configuration that
requests unavailable channels stops with an explicit error instead of silently choosing
another pair. Native ASIO/CoreAudio device capture is not implemented.

On input loss, Setcast reports the problem and releases capture. Reconnect the interface,
refresh the device list and start again. Browser permissions, device names and IDs can
change; a missing configured device must be reselected. No automatic fallback to another
input occurs.

Whole-set visualizers such as `overview` are omitted with a warning. Audio routes work;
there are no live track identities or annotations. **Tempo (BPM)**, **Tap tempo** and
**Downbeat now** drive the beat/bar variables and modulation. Clear BPM to disable the
manual grid. Optional [assisted beat tracking](live-beat-tracking.md) estimates tempo and phase;
it starts disabled and requires explicit adoption before changing that grid. Cue routes rest at their baseline, and
play-scoped routes have no panels to affect. `--set-progress` stays
at zero; CSS that derives motion exclusively from progress will not advance. Precomputed
`--travel-*` variables are unavailable. Background drift still follows elapsed time.

Continuous tempo following, live drop detection, DJ hardware events, audio recording and direct
streaming are not implemented. The session journal below records manual metadata for replay.

## Timing and readiness

An AudioWorklet captures discrete channels and sends selected stereo PCM in 1024-sample
packets. The processor produces silence at its output. Speech-oriented echo cancellation,
noise suppression and automatic gain control are requested off.

Sample positions drive session time. Rendering can skip frames without slowing capture.
The shared PCM analyzer retains the same centered FFT calculation as recorded playback:
1024 samples of lookahead, about 21 ms at 48 kHz, plus packet delivery, device and display
latency. This is not a measured end-to-end latency guarantee.

PCM retention is fixed at 11 seconds, covering the eight-second history contract,
additional visual delay and analysis padding. Feature caching is capped at 2048 moments.
The worklet permits half a second of unacknowledged packets, rounded up to a complete packet,
with a hard cap of 96 packets (768 KiB of queued stereo PCM). At 48 kHz this is 24 packets,
192 KiB and 512 ms; one additional packet is being filled. This absorbs brief main-thread stalls without delaying normal delivery;
longer overload drops analysis packets instead of queuing indefinitely. Missing packets become silence at their original times.
The dock reports how much analysis was skipped. Channel and sensitivity changes discard
old analysis without resetting session time.

Fonts, images and video hold scene preparation only. The previous ready scene stays
visible while its replacement loads; capture continues. Background video plays silently
and loops independently of the audio session. It is decorative media, not synchronized
playback of a recorded performance.

Keep the output window visible. Browser background throttling, GPU cost and power-saving
behavior can affect smoothness. Choose a resolution, frame rate and theme that the
machine can sustain before using it for a performance.


## Session journal and replay

See [live performance controls](live-performance.md) for scene pads, brightness/intensity,
blackout, bar-aligned fades and MIDI. Those actions also enter the journal for replay.

**Start journal** writes a version 1 `session-*.jsonl` file beside live.yaml. The journal
records credits entered with **Log track now**, cue buttons, and scene changes. These manual
credit and cue entries are replay metadata; they do not add live track panels or trigger live cue effects.
**Finish journal** writes an end marker. Starting or stopping the input ends the current
journal; reconnect with a new journal. Completed lines are flushed to disk. An abrupt window
close may omit pending writes or the end marker; complete earlier lines remain usable.

The journal stores capture sample positions, sample rate, its origin in the capture clock,
and references to self-contained saved scenes. Visual delay does not shift journal timestamps. Manual actions use the most recently delivered
PCM sample position, so their time resolution follows packet delivery (about 23 ms at 44.1 kHz).
Scene writes are serialized and bounded. If saving falls behind or fails, journaling stops
with a notice while input capture continues. Keep the journal and its journal-scene directories
together. It does not contain audio.

Record the mixer master separately, then align journal time zero explicitly:

```sh
setcast replay path/to/session-....jsonl --audio path/to/master.wav --offset 2.35
setcast play path/to/replay-...
setcast render path/to/replay-... --renderer browser
```

`--offset` is the master-file time corresponding to journal time zero. It can be negative
(use `--offset=-2.35`). It is required; zero is never guessed. Replay creates a new directory
beside the journal, copies the master and scenes, and writes a finite setcast.yaml. Initial
scene dimensions/FPS determine output dimensions/FPS. Manual tempo phase is shifted with the
capture clock. Scene changes alter theme, title, art, visualizers, modulation and tempo.
`--theme` replaces the recorded scene sequence with one theme for the whole export.

Credits and the last scene before a trimmed start carry forward to time zero. Events beyond
the master duration are omitted; cues before zero are omitted. The first retained scene also
fills any recording prefix before the journal. Same-sample credit or scene corrections keep
the final value. The resulting project shows normal finite credits and clock behavior, so it
is a polished replay rather than an exact record of every live-screen pixel.

The prototype rejects nondefault capture sensitivity or visual delay because it cannot yet
reproduce those settings from the master without an explicit policy. Channel routing and the
master recording must describe the same stereo mix. There is no automatic clock-drift
correction, waveform alignment or reconciliation of missing events. Edit the generated
project when the recorded master differs from the monitored signal.

## Diagnostics and qualification

**Session diagnostics** records frame updates, skipped analysis samples, cache use, visibility,
and JavaScript heap use when the browser exposes it. **Download diagnostics** saves the latest
two hours. Moving controls to the operator window retains the samples. Heap values are browser
estimates, not total process or GPU memory. FPS measures delivered frame updates, not physical
display latency.
Each FPS window resets when the capture source, input availability or document visibility changes.
Adaptive quality consumes each complete window once, so paused startup time and repeated availability
updates do not count as sustained rendering overload.

`node packages/renderer-browser/bench/transport.ts` compares the current queue with the former
eight-packet policy under the same 300 ms main-thread stall. The current queue retained all samples
locally; the negative control skipped 6144. This is a bounded transport improvement, not a promise
that rendering stays smooth while the main thread is blocked. Sample positions and healthy packet
delivery remain unchanged.

The automated synthetic-input check is:

```sh
node packages/renderer-browser/bench/player.ts --seconds 120 --out examples/demo/out/player-check
```

It checks theme changes, operator transfer, journal continuity, tempo controls, capture restart,
bounded feature caching and capture status. A 120-second Chromium run passed with zero dropped
analysis samples and all 16 theme selections. A one-hour synthetic run kept capture running
with fixed PCM capacity and at most 1707 cached features (limit 2048). It skipped one
1024-sample analysis packet near the start under concurrent load, with no further skips.
That run preceded final UI polish; a final 120-second check covers the performance controls,
with zero dropped analysis samples and bounded feature caching.
Later configurable one-hour and two-hour synthetic workloads passed with zero observed drops,
repeated scene/announcement changes, capture restarts and forced GPU recovery. Their revisions,
measurements and limits are recorded in [qualification-2026-10-23.md](qualification-2026-10-23.md).
Physical interface routing, end-to-end latency, OBS integration and long-session hardware
stability remain unqualified. Use the checklist in
[player-development-plan.md](player-development-plan.md) with the intended hardware.

## Projection geometry

[Camera test patterns](camera-setup.md) provide alignment, grayscale, detail and explicit-time
motion samples. `testPattern:` in live.yaml configures them; the operator explicitly enables
the output. Settings transfer uses versioned JSON, and scene recall preserves setup settings.

[One-projector setup](projector-setup.md) provides four-corner correction, source crop, fixed
output masks, a static calibration pattern and saved venue profiles. Scene recalls preserve
these settings; journal replay exports the original composition without venue geometry.

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

**H** toggles clean output, hiding every control and notice. **H** or **Esc** restores the
controls. **F** toggles fullscreen. Move the browser to the desired display before entering
fullscreen. **[** and **]** switch themes. There is one capture owner in this window;
opening another player window starts an independent session, not a remote control.

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

The supported keys are `title`, `theme`, `background`, `backgroundFit`, `css`, `clock`,
`output`, `input`, `visualizer` and `modulation`. Live `output` accepts only `width`,
`height` and `fps`; it has no encoding settings or output file. Asset paths must stay
inside the project directory. Restart the command after editing the YAML or CSS.

The dock can change the theme, title, elapsed clock, artwork, channels, sensitivity and
delay. These adjustments do not write files. Artwork can also be dropped onto the player.
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
there are no live track identities, annotations or tempo grid. Cue and tempo routes rest
at their baseline, and play-scoped routes have no panels to affect. `--set-progress` stays
at zero; CSS that derives motion exclusively from progress will not advance. Precomputed
`--travel-*` variables are unavailable. Background drift still follows elapsed time.

Automatic BPM/drop detection, DJ hardware events, audio recording, event logs and direct
streaming are separate features.

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
At most eight worklet packets can await acknowledgement (64 KiB of stereo PCM, about
171 ms at 48 kHz). This absorbs short main-thread stalls without delaying normal delivery;
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

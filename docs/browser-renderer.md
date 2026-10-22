# Experimental browser exporter

Remotion remains Setcast's default renderer. The opt-in `browser` exporter uses Playwright,
its pinned Chromium runtime, and a system FFmpeg subprocess. Themes, visualizers, timeline
queries, audio analysis and frame assembly use the same Setcast contracts in both exporters.
The browser package has no Remotion dependency.

## Run it

Install FFmpeg on PATH, then install the pinned browser once:

```sh
setcast browser-install
setcast still path/to/project --renderer browser --at 1:30 --out frame.png
setcast render path/to/project --renderer browser --range 1:00-1:10 --out clip.mp4
setcast clip path/to/project --renderer browser --at 1:30
```

In a checkout, prefix these commands with `node packages/cli/bin/setcast.js` in place of
`setcast`. Linux also needs Chromium's system libraries. Browser installation is explicit;
ordinary Remotion rendering retains its existing provisioning.

To select the exporter for a project:

```yaml
renderer: browser
```

Omitting `renderer` selects `remotion`. `--renderer` overrides the YAML for `render`, `still`
and `clip`, including bundled thumbnails and batches. Failure is reported without switching
exporters. `preview` still opens Remotion Studio. `play` and `live` use browser playback
independently of this export setting.

## Supported settings and limits

The prototype writes PNG, JPEG and WebP stills, and H.264 video with AAC audio in MP4, MOV or
MKV. Video requires FFmpeg with `libx264`; WebP requires `libwebp`. PNG and JPEG need no system
FFmpeg. Audio analysis accepts mono or stereo recordings supported by the pinned Chromium
and Mediabunny decoder. Re-export an unsupported input as PCM WAV.

`output.gl` currently accepts `auto`, `default` and `angle`. Other graphics backends fail
with an explicit alternative before capture.

Software encoding supports `crf`, `videoBitrate`, `x264Preset`, `jpegQuality`, profiles and
`chunkSeconds`. `parallelEncoding` must be true. Hardware encoding is not implemented:
`required` fails; the CLI reports software fallback for `if-possible`. Direct adapter calls
must pass `hardwareAcceleration: disable` or omit it.

`--concurrency` accepts 1 through 8 and defaults to 1. Each worker retains its own bounded
PCM windows and decoder cache, so more workers use more memory. Batches contain at most one
image per worker; encoded frames are written in order with backpressure. Start at 1 or 2
and measure your project. Independence is not a speed guarantee.

Ctrl+C or SIGTERM cancels a CLI export. Programmatic `render` and `still` accept an
`AbortSignal`. Preparation may need to finish before cancellation is observed. Video output
is assembled in a temporary directory beside the destination and renamed only after success.
Failure and cancellation preserve an existing output file and remove temporary files.

## Frame delivery

The Node driver requests an absolute integer frame. The browser prepares the corresponding
PCM window, calls core's `resolveFrame`, commits React, and waits for labeled asset holds,
layout effects, canvas work, fonts, decoded images and stable animation-frame callbacks.
The driver checks the acknowledged frame number before capturing. Readiness errors name the
pending asset; a separate watchdog bounds requests that stall during audio decoding.

Background video uses Mediabunny to decode the requested frame into an image. It does not
use the approximate native-video synchronization used by real-time playback. Chunk boundaries
use core's shared range math. FFmpeg encodes one continuous master soundtrack, then muxes it
with the silent video chunks. No full-set AudioFeatures sidecar is required.

## Verification and comparison

Run both exporters against generated fixtures:

```sh
vp run export-acceptance --out examples/demo/out/remotion-reference
vp run export-acceptance --adapter ./packages/renderer-browser/src/export/index.ts --out examples/demo/out/browser-acceptance
vp run package-smoke --browser
node packages/renderer-browser/bench/frames.ts
```

The suite checks fractional ranges, the partial final frame, chunking, audio/video pulses,
delayed fonts, images, video seeking and looping, repeatable theme captures, failure recovery,
and cancellation. Both exporters passed on 2026-10-22. A direct driver check also verifies backward seeks,
video decoder reuse and delayed scene fonts within one page. Fixture audio pulses were within 5 ms
of the visual pulse. Packed CLI checks cover browser PNG and H.264/AAC output as well as the
default renderer and all built-in themes. JPEG, MOV and MKV are also verified. The local FFmpeg build lacks
`libwebp`, so WebP reports that prerequisite before capture and was not qualified on this machine.

Do not assume identical pixels across Chromium versions or graphics backends. On this machine,
Playwright 1.64.1 / Chromium 156.0.8078.4 matched the `relief` portrait reference exactly.
`sterile-tech` differed by at most 2/255 per color channel and `darkroom` by at most 1/255.
Mean absolute channel differences were 0.01035 and 0.00000434 respectively. Each exporter was
internally repeatable. The acceptance runner's `--reference` option deliberately still requires
exact pixels; those two cross-exporter fixtures do not satisfy that stricter condition.

A two-minute 1920×1080/30 fps demo export completed 3600 frames in about 169 seconds
with two workers and 20-second chunks on the development machine. Remotion took about
144 seconds with the same project and settings, so this prototype was about 18% slower.
Other local checks were running during parts of the measurements. Remotion imports were
explicitly forbidden during that run. This is one project measurement, not a general benchmark.

Keep both adapters while checking real projects, codecs, fonts, graphics backends, long exports
and installed distributions. Remove Remotion only after the alternative meets the supported
workloads and performance expectations. The next useful work is profiling capture/encoding,
qualifying Linux and Windows, and expanding fixture coverage. A sidecar or another capture API
should follow measurements, not precede a working exporter.

# Transparent overlays and editing output

The browser renderer exports ProRes 4444 video with straight alpha and 24-bit PCM audio in MOV.
Use this format for a transparent overlay or an opaque editing intermediate. H.264/AAC remains
the default delivery format. ProRes uses more storage and lossless PNG capture; it is not the
fast H.264 export path.

```yaml
renderer: browser
output:
  codec: prores-4444
  transparent: true
  width: 1920
  height: 1080
  fps: 30
  file: out/overlay.mov
```

Omit `transparent`, or set it to `false`, for an opaque intermediate. The default file becomes
`out/set.mov` when the codec is ProRes. `render`, `clip`, preview exports, resume and persistent
chunk reuse all use the selected format. `render --bundle` writes a PNG thumbnail for a transparent
project. `still` also defaults to PNG for that project; an explicit JPEG or WebP path is rejected.
Opaque projects retain their existing JPEG/WebP still support.

Use `setcast doctor --renderer browser --require alpha,prores` to check this machine. The check
encodes and decodes three PNG-derived ProRes frames, verifies partial alpha and straight RGB, and
decodes the PCM track. A missing ProRes encoder does not make the ordinary H.264 diagnostic fail.
The Setcast Remotion adapter explicitly rejects this format and transparent projects.

ProRes requires a `.mov` destination, `hardwareAcceleration: disable` and `profile: standard`.
Remove `crf`, `videoBitrate`, `x264Preset` and `jpegQuality`; these controls do not configure this
fixed ProRes 4444 profile. The encoder is FFmpeg's `prores_ks` subprocess. Setcast does not link
FFmpeg or download a separate codec. Use an FFmpeg installation with PNG, ProRes, PCM and MOV
support. Export checks actual encode/decode availability before opening capture pages.

## Transparent stage behavior

`transparent: true` removes the project/per-play background, the stage root's background and its
`::before`/`::after` backdrop decorations. It does not load or measure background art for Stage
layout. Foreground panels, visualizers, branding, child pseudo-elements and their CSS remain.
Themes therefore use their layout without measured art. Brightness changes the output's opacity,
so fading to zero removes the overlay instead of drawing a black rectangle over the receiving
footage. Scene changes preserve the project's transparent output mode.

A foreground component can still paint an opaque area. In particular, a full-frame GPU canvas
or a panel with an opaque fill remains opaque. Start with `visualizer: []` when only credits and
branding are needed. Custom themes can adjust foreground styles with
`.sc-stage[data-transparent]`; aggressive custom `!important` rules can override backdrop resets.
Effects such as backdrop blur operate on Setcast's own composition during export. They cannot
blur footage that is added later in an editor.
Light foreground text may need a stronger panel or a different color over bright footage.

## Color, alpha and audio contract

Chromium supplies 8-bit straight sRGB PNG pixels. FFmpeg converts them to limited-range BT.709
YUV with 4:4:4 chroma, tagged BT.709 primaries and sRGB transfer. The encoder receives
`yuva444p10le`, profile `4444`, and a 16-bit alpha plane. FFmpeg's decoder reports `yuva444p12le`;
that container/decoder description does not add precision to the original 8-bit browser pixels.
RGB is not multiplied by alpha before encoding. Interpret the file as straight/unassociated
alpha in a receiving application.

One continuous soundtrack is sliced at the rounded first video frame, resampled to 48 kHz stereo,
padded to the exported duration and encoded as `pcm_s24le`. It is muxed after the video chunks
are joined. PCM and larger intermediate bit depths do not restore information absent from the
source. Existing absolute-frame timing and atomic output replacement remain in force.

## Qualification

The [local qualification](research/prores-alpha-2026-11-01/README.md) compares every decoded pixel
in 63 moving chart frames against transparent Chromium PNGs, composited over black and white.
It covers partial alpha, fine type, glow, a gradient mask, chunk joins, exact source-slice PCM,
cache reuse, interruption/resume, brightness and transparent stills for all sixteen themes.
The independent macOS AVFoundation decoder identifies straight alpha, honors the color metadata
and decodes the same frame timestamps within the recorded pixel limits.

These are local Chromium/FFmpeg and AVFoundation checks. They do not qualify every editor's color
management settings, OBS media-source playback, Linux/Windows decoding, or a long ProRes export.
Inspect a short clip in the receiving application before choosing its project color settings.
VP9 alpha is not exposed. Its independently encoded chunks require separate alpha-boundary
qualification; the current [upstream documentation](https://www.remotion.dev/docs/transparent-videos)
also identifies that risk. ProRes supplies the initial transparent and editing output without
requiring a second video codec implementation.
